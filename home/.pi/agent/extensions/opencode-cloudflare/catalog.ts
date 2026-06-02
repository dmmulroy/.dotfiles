import { getModels, type Api, type Model } from "@earendil-works/pi-ai";
import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import { DEFAULT_ROUTE_URLS, type Backend } from "./constants.ts";
import { getDefaultGatewayConfig, getGatewayConfig, stripRoutePrefix, type GatewayModelConfig } from "./wellknown.ts";

export type ResponseVerbosity = "low" | "medium" | "high";

export interface RouteDescriptor {
  backend: Backend;
  api: Api;
  baseUrl: string;
  headers: Record<string, string>;
  requestModelId?: string;
  responseVerbosity?: ResponseVerbosity;
  compat?: Model<Api>["compat"];
}

export interface CatalogData {
  models: ProviderModelConfig[];
  routes: Map<string, RouteDescriptor>;
  counts: Record<Backend, number>;
}

const DEFAULT_WORKERS_MODELS: Record<string, GatewayModelConfig> = {
  "@cf/moonshotai/kimi-k2.5": {
    id: "workers-ai/@cf/moonshotai/kimi-k2.5",
    name: "Kimi K2.5",
    attachment: true,
    reasoning: true,
    tool_call: true,
    temperature: true,
    interleaved: { field: "reasoning_content" },
    modalities: { input: ["text", "image"], output: ["text"] },
    cost: { input: 0.6, cache_read: 0.1, output: 3 },
    limit: { context: 256000, output: 32000 },
    options: { temperature: 1, top_p: 0.95, max_tokens: 32000, store: false, parallel_tool_calls: true },
  },
  "@cf/moonshotai/kimi-k2.6": {
    id: "workers-ai/@cf/moonshotai/kimi-k2.6",
    name: "Kimi K2.6",
    attachment: true,
    reasoning: true,
    tool_call: true,
    temperature: true,
    interleaved: { field: "reasoning_content" },
    modalities: { input: ["text", "image"], output: ["text"] },
    cost: { input: 0.95, cache_read: 0.16, output: 4 },
    limit: { context: 262144, output: 32000 },
    options: { temperature: 1, top_p: 0.95, max_tokens: 32000, store: false, parallel_tool_calls: true },
  },
  "@cf/zai-org/glm-4.7-flash": {
    id: "workers-ai/@cf/zai-org/glm-4.7-flash",
    name: "GLM-4.7-Flash",
    attachment: true,
    reasoning: true,
    tool_call: true,
    temperature: true,
    interleaved: { field: "reasoning_content" },
    cost: { input: 0.06, output: 0.4 },
    limit: { context: 131072, output: 32000 },
    options: { temperature: 0.95, top_p: 0.7, max_tokens: 32000, store: false, parallel_tool_calls: true },
  },
  "@cf/nvidia/nemotron-3-120b-a12b": {
    id: "workers-ai/@cf/nvidia/nemotron-3-120b-a12b",
    name: "Nemotron 3 Super 120B",
    attachment: false,
    reasoning: true,
    tool_call: true,
    temperature: true,
    interleaved: { field: "reasoning_content" },
    modalities: { input: ["text"], output: ["text"] },
    cost: { input: 0.5, output: 1.5 },
    limit: { context: 256000, output: 32000 },
    options: { temperature: 0.6, top_p: 0.95, max_tokens: 32000, store: false, parallel_tool_calls: false },
  },
  "@cf/google/gemma-4-26b-a4b-it": {
    id: "workers-ai/@cf/google/gemma-4-26b-a4b-it",
    name: "Gemma 4 26B A4B IT",
    attachment: true,
    reasoning: true,
    tool_call: true,
    temperature: true,
    interleaved: { field: "reasoning_content" },
    modalities: { input: ["text", "image"], output: ["text"] },
    cost: { input: 0.1, output: 0.3 },
  },
  "@cf/zai-org/glm-5.1": {
    id: "workers-ai/@cf/zai-org/glm-5.1",
    name: "GLM 5.1",
    attachment: false,
    reasoning: true,
    tool_call: true,
    temperature: true,
    interleaved: { field: "reasoning_content" },
    modalities: { input: ["text"], output: ["text"] },
    cost: { input: 1.4, cache_read: 0.26, output: 4.4 },
    limit: { context: 200000, output: 32000 },
    options: { temperature: 0.7, top_p: 0.95, max_tokens: 32000, store: false, parallel_tool_calls: true },
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

function isBlacklistedModel(
  modelId: string,
  backend: Backend,
  blacklist: string[] | undefined,
  config?: GatewayModelConfig,
): boolean {
  if (!blacklist?.length) return false;
  const denied = new Set(blacklist.flatMap((id) => [id, stripRoutePrefix(id, backend)]));
  const candidates = [modelId, stripRoutePrefix(modelId, backend)];
  if (config?.id) {
    candidates.push(config.id, stripRoutePrefix(config.id, backend));
  }
  return candidates.some((candidate) => denied.has(candidate));
}

function toProviderModelConfigFromGateway(modelId: string, config: GatewayModelConfig): ProviderModelConfig {
  return {
    id: modelId,
    name: config.name || modelId,
    reasoning: config.reasoning !== false,
    thinkingLevelMap: config.thinkingLevelMap,
    input: normalizeInputModalities(config),
    cost: {
      input: config.cost?.input || 0,
      output: config.cost?.output || 0,
      cacheRead: config.cost?.cache_read || 0,
      cacheWrite: config.cost?.cache_write || 0,
    },
    contextWindow: config.limit?.context || 128000,
    maxTokens: config.limit?.output || Number(config.options?.max_tokens) || 16384,
    compat: config.compat,
  };
}

function resolveGatewayModelConfig(
  modelId: string,
  gatewayModels: Record<string, GatewayModelConfig>,
  backend: Backend,
): GatewayModelConfig | undefined {
  return gatewayModels[modelId] || gatewayModels[`${backend}/${modelId}`] || gatewayModels[`anthropic/${modelId}`];
}

function getResponseVerbosity(config: GatewayModelConfig | undefined): ResponseVerbosity | undefined {
  const text = config?.options?.text;
  if (!text || typeof text !== "object" || Array.isArray(text)) return undefined;
  const verbosity = (text as Record<string, unknown>).verbosity;
  return verbosity === "low" || verbosity === "medium" || verbosity === "high" ? verbosity : undefined;
}

function applyGatewayModelLimit(model: Model<Api>, gatewayModels: Record<string, GatewayModelConfig>, backend: Backend): Model<Api> {
  const gatewayConfig = resolveGatewayModelConfig(model.id, gatewayModels, backend);
  if (!gatewayConfig?.limit) return model;
  return {
    ...model,
    contextWindow: gatewayConfig.limit.context || model.contextWindow,
    maxTokens: gatewayConfig.limit.output || model.maxTokens,
  };
}

function buildBuiltInModels(
  backend: Exclude<Backend, "workers-ai">,
  gatewayModels: Record<string, GatewayModelConfig>,
  blacklist?: string[],
  hasGatewayModels: boolean = false,
): Model<Api>[] {
  const provider = backend === "google" ? "google" : backend;
  let builtIns = getModels(provider as "anthropic" | "openai" | "google") as Model<Api>[];

  // Gateway-provided OpenAI model entries are an allowlist. Machine-local overlays
  // are additions and must not accidentally hide every built-in OpenAI model.
  if (backend === "openai" && hasGatewayModels) {
    const allowlist = new Set(Object.keys(gatewayModels).map((id) => stripRoutePrefix(id, backend)));
    builtIns = builtIns.filter((model) => allowlist.has(model.id));
  }

  return builtIns
    .filter((model) => !isBlacklistedModel(model.id, backend, blacklist))
    .map((model) => applyGatewayModelLimit(model, gatewayModels, backend));
}

function buildWorkersModels(
  gatewayModels: Record<string, GatewayModelConfig>,
  baseUrl: string,
  headers: Record<string, string>,
  whitelist?: string[],
  blacklist?: string[],
) {
  const source = Object.keys(gatewayModels).length > 0 ? gatewayModels : DEFAULT_WORKERS_MODELS;
  const allowedIds = whitelist?.length ? new Set(whitelist) : undefined;
  const models: ProviderModelConfig[] = [];
  const routes = new Map<string, RouteDescriptor>();

  for (const [fullModelId, config] of Object.entries(source)) {
    const shortId = stripRoutePrefix(fullModelId, "workers-ai");
    // Skip models not in whitelist (match against both full ID and short ID)
    if (allowedIds && !allowedIds.has(fullModelId) && !allowedIds.has(shortId)) continue;
    if (isBlacklistedModel(fullModelId, "workers-ai", blacklist, config)) continue;
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
      const workers = buildWorkersModels(route.models, route.baseUrl || DEFAULT_ROUTE_URLS[backend], route.headers, route.whitelist, route.blacklist);
      models.push(...workers.models);
      for (const [modelId, descriptor] of workers.routes.entries()) {
        routes.set(modelId, descriptor);
      }
      counts[backend] = workers.models.length;
      continue;
    }

    const builtIns = buildBuiltInModels(backend, route.models, route.blacklist, route.hasGatewayModels);
    const seenModelIds = new Set<string>();
    for (const model of builtIns) {
      seenModelIds.add(model.id);
      models.push(toProviderModelConfig(model));
      routes.set(model.id, {
        backend,
        api: model.api,
        baseUrl: route.baseUrl,
        headers: route.headers,
        responseVerbosity: getResponseVerbosity(resolveGatewayModelConfig(model.id, route.models, backend)),
        compat: model.compat,
      });
    }

    for (const [fullModelId, config] of Object.entries(route.models)) {
      const shortId = stripRoutePrefix(fullModelId, backend);
      if (seenModelIds.has(shortId) || isBlacklistedModel(fullModelId, backend, route.blacklist, config)) continue;
      seenModelIds.add(shortId);
      models.push(toProviderModelConfigFromGateway(shortId, config));
      routes.set(shortId, {
        backend,
        api: DEFAULT_BACKEND_APIS[backend],
        baseUrl: route.baseUrl,
        headers: route.headers,
        requestModelId: config.id || (backend === "anthropic" ? shortId : fullModelId),
        responseVerbosity: getResponseVerbosity(config),
        compat: config.compat,
      });
    }
    counts[backend] = seenModelIds.size;
  }

  return { models, routes, counts };
}
