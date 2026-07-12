# Cloudflare Composition Root Examples

Load the example matching the implementation shape. These are structural templates, not names to copy blindly.

## Port, service, and binding adapter

Application-owned port and service:

```ts
export interface JurisdictionCache {
  get(namespace: CompositeNamespace): Promise<Jurisdiction | undefined>;
  set(namespace: CompositeNamespace, jurisdiction: Jurisdiction): Promise<void>;
}

export type ResolveJurisdictionDependencies = Readonly<{
  cache: JurisdictionCache;
  claims: JurisdictionClaims;
  tracer: Tracer;
}>;

export class ResolveJurisdictionService {
  readonly #cache: JurisdictionCache;
  readonly #claims: JurisdictionClaims;
  readonly #tracer: Tracer;

  constructor(dependencies: ResolveJurisdictionDependencies) {
    this.#cache = dependencies.cache;
    this.#claims = dependencies.claims;
    this.#tracer = dependencies.tracer;
  }

  async execute(namespace: CompositeNamespace): Promise<Jurisdiction | null> {
    return this.#tracer.span('jurisdiction.resolve', async () => {
      const cached = await this.#cache.get(namespace);
      if (cached !== undefined) {
        return cached;
      }

      const claimed = await this.#claims.lookup(namespace);
      if (claimed !== null) {
        await this.#cache.set(namespace, claimed);
      }
      return claimed;
    });
  }
}
```

Technology adapter:

```ts
export class WorkersKvJurisdictionCache implements JurisdictionCache {
  readonly #kv: KVNamespace;
  readonly #tracer: Tracer;

  constructor(kv: KVNamespace, tracer: Tracer) {
    this.#kv = kv;
    this.#tracer = tracer;
  }

  get(namespace: CompositeNamespace): Promise<Jurisdiction | undefined> {
    return this.#tracer.span('jurisdictionCache.get', async (span) => {
      const value = await this.#kv.get(`jurisdiction:v1:${namespace.toString()}`);
      if (value === null) {
        span.set({ result: 'miss' });
        return undefined;
      }
      const jurisdiction = parseJurisdiction(value);
      span.set({ result: 'hit', jurisdiction });
      return jurisdiction;
    });
  }

  set(namespace: CompositeNamespace, jurisdiction: Jurisdiction): Promise<void> {
    return this.#tracer.span('jurisdictionCache.set', async () => {
      await this.#kv.put(`jurisdiction:v1:${namespace.toString()}`, jurisdiction);
    });
  }
}
```

The adapter parses KV output. The service decides what a miss means and whether a write failure is best effort.

## Hono with reusable dependencies

Use this when bindings, adapters, services, and tracer are concurrency-safe and retain no invocation state.

```ts
type AppEnv = {
  Bindings: Record<string, never>;
};

export type AppDependencies = Readonly<{
  tracer: Tracer;
  documents: DocumentService;
}>;

export function createApp(dependencies: AppDependencies): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use('*', createTracingMiddleware(dependencies.tracer));
  registerDocumentRoutes(app, { documents: dependencies.documents });
  return app;
}

export class HttpService extends WorkerEntrypoint<Env> {
  readonly #app: Hono<AppEnv>;

  constructor(ctx: ExecutionContext, env: Env) {
    super(ctx, env);

    const tracer = createTracer();
    const store = new WorkersKvDocumentStore(env.DOCUMENTS, tracer);
    const documents = new DocumentService({ store, tracer });
    this.#app = createApp({ tracer, documents });
  }

  override fetch(request: Request): Response | Promise<Response> {
    return this.#app.fetch(request, {}, this.ctx);
  }
}
```

Route registration closes over the exact service:

```ts
export function registerDocumentRoutes(
  app: Hono<AppEnv>,
  dependencies: Readonly<{ documents: DocumentService }>,
): void {
  app.get('/documents/:id', async (context) => {
    const id = parseDocumentId(context.req.param('id'));
    const result = await dependencies.documents.get(id);
    return result === null ? context.notFound() : context.json(toApiDocument(result));
  });
}
```

## Hono with invocation-scoped dependencies

Use this when a dependency retains invocation state or a tracer is not safe to retain across requests. The entrypoint supplies a narrow composition function that closes over raw bindings; the first owning middleware invokes it after correlation is established.

```ts
type RequestServices = Readonly<{
  documents: DocumentService;
}>;

type InvocationAppDependencies = Readonly<{
  createRequestServices(tracer: Tracer): RequestServices;
}>;

type InvocationAppEnv = {
  Bindings: Record<string, never>;
  Variables: {
    tracer: Tracer;
    documents: DocumentService;
  };
};

function createInvocationApp(
  dependencies: InvocationAppDependencies,
): Hono<InvocationAppEnv> {
  const app = new Hono<InvocationAppEnv>();

  app.use('*', async (context, next) => {
    const tracer = createTracer();
    const correlationId = correlationIdFromRequest(context.req.raw);

    await tracer.withCorrelation(correlationId, async () => {
      const services = dependencies.createRequestServices(tracer);
      context.set('tracer', tracer);
      context.set('documents', services.documents);
      await next();
    });
  });

  return app;
}

export class HttpService extends WorkerEntrypoint<Env> {
  readonly #app: Hono<InvocationAppEnv>;

  constructor(ctx: ExecutionContext, env: Env) {
    super(ctx, env);

    this.#app = createInvocationApp({
      createRequestServices: (tracer) => {
        const store = new WorkersKvDocumentStore(env.DOCUMENTS, tracer);
        return {
          documents: new DocumentService({ store, tracer }),
        };
      },
    });
  }

  override fetch(request: Request): Response | Promise<Response> {
    return this.#app.fetch(request, {}, this.ctx);
  }
}
```

The closure that can see `env.DOCUMENTS` is defined at the entrypoint and passes the raw binding only to its adapter. Middleware and routes receive exact typed capabilities and do not read `context.env`.

## WorkerEntrypoint or JSRPC binding

```ts
export class DocumentsBinding extends WorkerEntrypoint<Env, BindingProps> {
  readonly #tracer: Tracer;
  readonly #documents: DocumentService;

  constructor(ctx: ExecutionContext, env: Env) {
    super(ctx, env);

    this.#tracer = createTracer();
    this.#documents = new DocumentService({
      store: new WorkersKvDocumentStore(env.DOCUMENTS, this.#tracer),
      tracer: this.#tracer,
    });
  }

  async get(rawId: string): Promise<ApiDocument | null> {
    const id = parseDocumentId(rawId);
    return this.#tracer.span('binding.documents.get', async () => {
      const result = await this.#documents.get(id);
      return result === null ? null : toApiDocument(result);
    });
  }
}
```

The binding validates and projects. The service owns document policy. The adapter owns KV mechanics.

## Dynamic account-bound construction

Use an application-owned factory only when information required for construction appears after authentication.

```ts
export interface AccountDocumentServiceFactory {
  forAccount(account: AccountIdentity): DocumentService;
}

export class DefaultAccountDocumentServiceFactory
  implements AccountDocumentServiceFactory
{
  constructor(
    private readonly store: DocumentStore,
    private readonly tracer: Tracer,
  ) {}

  forAccount(account: AccountIdentity): DocumentService {
    return new DocumentService({
      account,
      store: this.store,
      tracer: this.tracer,
    });
  }
}
```

The factory receives application capabilities. It does not receive or retain `Env`.

## Existing-code migration

Move the seam outward without a big-bang rewrite:

```diff
 class DocumentService {
-  constructor(private readonly env: Env) {}
+  constructor(private readonly store: DocumentStore) {}

   get(id: DocumentId) {
-    return this.env.DOCUMENTS.get(documentKey(id));
+    return this.store.find(id);
   }
 }
```

First caller:

```diff
-const service = new DocumentService(env);
+const store = new WorkersKvDocumentStore(env.DOCUMENTS, tracer);
+const service = new DocumentService(store);
```

If this caller is not a composition root, pass `DocumentStore` outward through its constructor and repeat. Delete the old `Env` path after the final caller moves.

## Verification searches

Tailor searches to the repository and changed bindings:

```bash
rg 'Env|KVNamespace|R2Bucket|D1Database|DurableObjectNamespace|ExecutionContext' src
rg 'context\.env|this\.env|env\.[A-Z][A-Z0-9_]+' src
rg 'new WorkersKv|new .*Adapter|createTracer' src
```

Every match should identify a composition root, binding adapter, framework declaration, or violation.
