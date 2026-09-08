# TypeScript safety

## Strictness and immutable values

New or changed TypeScript configurations enable:

- `strict: true`;
- `noUncheckedIndexedAccess: true`;
- `exactOptionalPropertyTypes: true`;
- `noImplicitOverride: true`;
- `noFallthroughCasesInSwitch: true`.

A legacy configuration that cannot adopt a listed flag within the changed behavior keeps the exception scoped to that configuration and records the blocking compiler diagnostics and migration boundary.

Prefer immutable values:

```ts
type CreateUserInput = {
  readonly email: EmailAddress;
  readonly roles: ReadonlyArray<Role>;
};
```

Localize mutation inside imperative shell code, performance-sensitive internals, builders, or Adapters and hide it behind a precise interface.

Exported interface methods and public class methods have explicit return types. Exported functions that return an object, union, or collection also state that return type explicitly. Write a concise return type inline; introduce a named exported result contract when its name adds domain meaning or the contract is reused. Derive the contract from an owning runtime schema instead of duplicating schema and handwritten types. Local callbacks and unexported helpers use inference when their declarations preserve the complete contract.

## Preserve established evidence

Keep owner-provided domain, application, library, and platform types through parameters, results, and transformations. Search the owning schema, public type, constructor, or generic parameter before introducing a local approximation. Broad records and `unknown` belong only where the actual representation requires them; their convenience does not justify erasing a known type.

Use `satisfies` or an explicit return type to check an already-established construction without widening it. These are compile-time checks: remaining runtime invariants follow [`parsing-and-schemas.md#provenance`](parsing-and-schemas.md#provenance). Keep precise success, error, and Effect requirement types when extracting helpers.

## Casts, `any`, and non-null assertions

Resolve uncertainty with branching, parsing, refinement, or a more precise signature. An unavoidable assertion requires an established runtime invariant that TypeScript cannot express, containment at its smallest owner, and focused verification. A generic abstraction or difficult library signature is not evidence by itself. Never widen a known value and assert it back, including chains through `unknown` or `any`.

`as const` preserves literals and needs no justification. Every other cast includes a safety comment explaining the runtime evidence and compiler limitation:

```ts
// SAFETY: TypeScript cannot express the brand. parseEmailAddress checked the normalized string before branding. Callers cannot construct EmailAddress except through this parser.
return normalized as EmailAddress;
```

A necessary `any` meets the same evidence bar and includes a targeted safety justification and any suppression required by repository policy. Prefer an owner-provided type or a precise generic signature; broader shared permission does not override stricter repository lint.

Branch, parse, or refine optional values so required values are present before use.

## Completion check

Changed source compiles under the repository's strict settings. Every new or changed TypeScript configuration enables all listed flags, or each scoped legacy exception records its blocking diagnostics and migration boundary. Mutable state is contained and known type evidence survives every changed boundary and helper. Exported interface methods, public class methods, and exported functions returning objects, unions, or collections have explicit return types; a named exported result contract adds domain meaning or serves more than one declaration, and derives from an owning schema where one exists. Every non-`as const` cast and `any` has concrete runtime evidence, a compiler limitation, focused verification, and the required safety justification; no widening-and-assertion chain or changed non-null assertion remains.