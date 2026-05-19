import { getModels, type Api, type Model } from "@earendil-works/pi-ai";
import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import { DEFAULT_ROUTE_URLS, type Backend } from "./constants.ts";
import { getDefaultGatewayConfig, getGatewayConfig, stripRoutePrefix, type GatewayModelConfig } from "./wellknown.ts";

export interface RouteDescriptor {
  backend: Backend;
  api: Api;
  baseUrl: string;
  headers: Record<string, string>;
  requestModelId?: string;
  compat?: Model<Api>["compat"];
}

export interface CatalogData {
  models: ProviderModelConfig[];
  routes: Map<string, RouteDescriptor>;
  counts: Record<Backend, number>;
}

const DEFAULT_WORKERS_MODELS: Record<string, GatewayModelConfig> = {
  "workers-ai/@cf/moonshotai/kimi-k2.5": {
    name: "Kimi K2.5",
    attachment: true,
    reasoning: true,
    tool_call: true,
    temperature: true,
    interleaved: { field: "reasoning_content" },
    modalities: { input: ["text", "image"], output: ["text"] },
    limit: { context: 256000, output: 64000 },
    options: { max_tokens: 64000, store: false, parallel_tool_calls: true },
  },
  "workers-ai/@cf/zai-org/glm-4.7-flash": {
    name: "GLM-4.7-Flash",
    attachment: true,
    reasoning: true,
    tool_call: true,
    temperature: true,
    interleaved: { field: "reasoning_content" },
    limit: { context: 131072, output: 64000 },
    options: { max_tokens: 64000, store: false, parallel_tool_calls: true },
  },
  "workers-ai/@cf/nvidia/nemotron-3-120b-a12b": {
    name: "Nemotron 3 Super 120B",
    attachment: false,
    reasoning: true,
    tool_call: true,
    temperature: true,
    interleaved: { field: "reasoning_content" },
    modalities: { input: ["text"], output: ["text"] },
    limit: { context: 256000, output: 64000 },
    options: { max_tokens: 64000, store: false, parallel_tool_calls: false },
  },
};

const DEFAULT_BACKEND_APIS: Record<Backend, Api> = {
  anthropic: "anthropic-messages",
  openai: "openai-responses",
  google: "google-generative-ai",
  "workers-ai": "openai-completions",
};

let activeCatalog: CatalogData = buildCatalogFromGateway(getDefaultGatewayConfig());

export function getCatalog(): CatalogData {
  return activeCatalog;
}

export async function refreshCatalog(forceReload: boolean = false): Promise<CatalogData> {
  const gateway = await getGatewayConfig({ forceReload, fallbackToDefault: true });
  activeCatalog = buildCatalogFromGateway(gateway);
  return activeCatalog;
}

export function summarizeCatalog(catalog: CatalogData = activeCatalog): string {
  return `anthropic=${catalog.counts.anthropic}, openai=${catalog.counts.openai}, google=${catalog.counts.google}, workers-ai=${catalog.counts["workers-ai"]}`;
}

function toProviderModelConfig(model: Model<Api>): ProviderModelConfig {
  return {
    id: model.id,
    name: model.name,
    reasoning: model.reasoning,
    thinkingLevelMap: model.thinkingLevelMap,
    input: model.input,
    cost: model.cost,
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
    compat: model.compat,
  };
}

function normalizeInputModalities(config: GatewayModelConfig): ("text" | "image")[] {
  const input = config.modalities?.input?.filter((value): value is "text" | "image" => value === "text" || value === "image");
  if (input?.length) return input;
  return config.attachment ? ["text", "image"] : ["text"];
}

function toProviderModelConfigFromGateway(modelId: string, config: GatewayModelConfig): ProviderModelConfig {
  return {
    id: modelId,
    name: config.name || modelId,
    reasoning: config.reasoning !== false,
    input: normalizeInputModalities(config),
    cost: {
      input: config.cost?.input || 0,
      output: config.cost?.output || 0,
      cacheRead: config.cost?.cache_read || 0,
      cacheWrite: 0,
    },
    contextWindow: config.limit?.context || 128000,
    maxTokens: config.limit?.output || Number(config.options?.max_tokens) || 16384,
  };
}

function applyGatewayModelLimit(model: Model<Api>, gatewayModels: Record<string, GatewayModelConfig>, backend: Backend): Model<Api> {
  const gatewayConfig = gatewayModels[model.id] || gatewayModels[`${backend}/${model.id}`] || gatewayModels[`anthropic/${model.id}`];
  if (!gatewayConfig?.limit) return model;
  return {
    ...model,
    contextWindow: gatewayConfig.limit.context || model.contextWindow,
    maxTokens: gatewayConfig.limit.output || model.maxTokens,
  };
}

function buildBuiltInModels(backend: Exclude<Backend, "workers-ai">, gatewayModels: Record<string, GatewayModelConfig>): Model<Api>[] {
  const provider = backend === "google" ? "google" : backend;
  const builtIns = getModels(provider as "anthropic" | "openai" | "google") as Model<Api>[];

  if (backend === "openai" && Object.keys(gatewayModels).length > 0) {
    const allowlist = new Set(Object.keys(gatewayModels).map((id) => stripRoutePrefix(id, backend)));
    return builtIns.filter((model) => allowlist.has(model.id)).map((model) => applyGatewayModelLimit(model, gatewayModels, backend));
  }

  return builtIns.map((model) => applyGatewayModelLimit(model, gatewayModels, backend));
}

function buildWorkersModels(gatewayModels: Record<string, GatewayModelConfig>, baseUrl: string, headers: Record<string, string>, whitelist?: string[]) {
  const source = Object.keys(gatewayModels).length > 0 ? gatewayModels : DEFAULT_WORKERS_MODELS;
  const allowedIds = whitelist?.length ? new Set(whitelist) : undefined;
  const models: ProviderModelConfig[] = [];
  const routes = new Map<string, RouteDescriptor>();

  for (const [fullModelId, config] of Object.entries(source)) {
    const shortId = stripRoutePrefix(fullModelId, "workers-ai");
    // Skip models not in whitelist (match against both full ID and short ID)
    if (allowedIds && !allowedIds.has(fullModelId) && !allowedIds.has(shortId)) continue;
    models.push({
      id: shortId,
      name: `${fullModelId} (${config.name || shortId})`,
      reasoning: config.reasoning !== false,
      input: normalizeInputModalities(config),
      cost: {
        input: config.cost?.input || 0,
        output: config.cost?.output || 0,
        cacheRead: config.cost?.cache_read || 0,
        cacheWrite: 0,
      },
      contextWindow: config.limit?.context || 128000,
      maxTokens: config.limit?.output || Number(config.options?.max_tokens) || 16384,
      compat: {
        supportsStore: false,
        supportsDeveloperRole: false,
        supportsReasoningEffort: false,
        maxTokensField: "max_tokens",
      },
    });
    routes.set(shortId, {
      backend: "workers-ai",
      api: "openai-completions",
      baseUrl,
      headers,
      requestModelId: config.id || fullModelId,
      compat: {
        supportsStore: false,
        supportsDeveloperRole: false,
        supportsReasoningEffort: false,
        maxTokensField: "max_tokens",
      },
    });
  }

  return { models, routes };
}

function buildCatalogFromGateway(gateway: Awaited<ReturnType<typeof getGatewayConfig>>): CatalogData {
  const models: ProviderModelConfig[] = [];
  const routes = new Map<string, RouteDescriptor>();
  const counts: Record<Backend, number> = {
    anthropic: 0,
    openai: 0,
    google: 0,
    "workers-ai": 0,
  };

  for (const backend of gateway.enabledBackends) {
    const route = gateway.routes[backend];
    if (backend === "workers-ai") {
      const workers = buildWorkersModels(route.models, route.baseUrl || DEFAULT_ROUTE_URLS[backend], route.headers, route.whitelist);
      models.push(...workers.models);
      for (const [modelId, descriptor] of workers.routes.entries()) {
        routes.set(modelId, descriptor);
      }
      counts[backend] = workers.models.length;
      continue;
    }

    const builtIns = buildBuiltInModels(backend, route.models);
    const seenModelIds = new Set<string>();
    for (const model of builtIns) {
      seenModelIds.add(model.id);
      models.push(toProviderModelConfig(model));
      routes.set(model.id, {
        backend,
        api: model.api,
        baseUrl: route.baseUrl,
        headers: route.headers,
        compat: model.compat,
      });
    }

    for (const [fullModelId, config] of Object.entries(route.models)) {
      const shortId = stripRoutePrefix(fullModelId, backend);
      if (seenModelIds.has(shortId)) continue;
      seenModelIds.add(shortId);
      models.push(toProviderModelConfigFromGateway(shortId, config));
      routes.set(shortId, {
        backend,
        api: DEFAULT_BACKEND_APIS[backend],
        baseUrl: route.baseUrl,
        headers: route.headers,
        requestModelId: config.id || (backend === "anthropic" ? shortId : fullModelId),
      });
    }
    counts[backend] = seenModelIds.size;
  }

  return { models, routes, counts };
}
