import { accessSync, constants, existsSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type, type Static } from "@sinclair/typebox";
import type { LspClient } from "./client.js";
import type { LspRuntime } from "./runtime.js";
import type {
  LspOperation,
  LspRunSummary,
  LspStructuredError,
  LspToolInput,
  PathNormalizationResult,
} from "./types.js";

const LSP_OPERATIONS = [
  "goToDefinition",
  "findReferences",
  "hover",
  "documentSymbol",
  "workspaceSymbol",
  "goToImplementation",
  "prepareCallHierarchy",
  "incomingCalls",
  "outgoingCalls",
] as const;

const WORKSPACE_SYMBOL_KINDS = new Set([5, 12, 6, 11, 13, 14, 23, 10]);

export const LspToolParametersSchema = Type.Object({
  operation: StringEnum(LSP_OPERATIONS),
  filePath: Type.String(),
  line: Type.Integer({ minimum: 1 }),
  character: Type.Integer({ minimum: 1 }),
});

type LspToolParameters = Static<typeof LspToolParametersSchema>;

function ensureReadableFile(filePath: string): void {
  accessSync(filePath, constants.R_OK);
}

function isWithinRoot(pathValue: string, root: string): boolean {
  return pathValue === root || pathValue.startsWith(`${root}/`);
}

export interface NormalizePathOptions {
  cwd: string;
  boundaryRoots: string[];
  allowExternalPaths: boolean;
  requireReadableFile?: boolean;
}

export function normalizeToolPath(rawPath: string, options: NormalizePathOptions): PathNormalizationResult {
  const stripped = rawPath.startsWith("@") ? rawPath.slice(1) : rawPath;
  const normalizedInput = stripped.trim();
  const absolutePath = isAbsolute(normalizedInput)
    ? normalizedInput
    : resolve(options.cwd, normalizedInput);

  let realPath = absolutePath;
  try {
    realPath = realpathSync(absolutePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw new Error(`Unable to resolve path '${rawPath}': ${(error as Error).message}`);
    }

    try {
      const realParent = realpathSync(dirname(absolutePath));
      realPath = resolve(realParent, basename(absolutePath));
    } catch {
      realPath = absolutePath;
    }
  }

  const normalizedRealPath = realPath.replace(/\\/g, "/");
  const normalizedRoots = [...new Set(options.boundaryRoots.flatMap((root) => {
    const roots = [root];
    try {
      roots.push(realpathSync(root));
    } catch {
      // Keep original root only.
    }
    return roots;
  }).map((root) => root.replace(/\\/g, "/")))];

  if (!options.allowExternalPaths) {
    const withinBoundary = normalizedRoots.some((root) => isWithinRoot(normalizedRealPath, root));
    if (!withinBoundary) {
      throw new Error(`Path '${rawPath}' is outside workspace boundary.`);
    }
  }

  if (options.requireReadableFile) {
    if (!existsSync(realPath)) {
      throw new Error(`File not found: ${realPath}`);
    }

    try {
      ensureReadableFile(realPath);
    } catch (error) {
      throw new Error(`File is not readable: ${realPath} (${(error as Error).message})`);
    }
  }

  return {
    raw: rawPath,
    normalizedInput,
    absolutePath,
    realPath,
  };
}

export function toProtocolPosition(line: number, character: number): { line: number; character: number } {
  return {
    line: Math.max(0, line - 1),
    character: Math.max(0, character - 1),
  };
}

function hasPosition(input: LspToolParameters): boolean {
  return typeof input.filePath === "string"
    && typeof input.line === "number"
    && typeof input.character === "number";
}

export function validateOperationInput(input: LspToolParameters): { ok: true; value: LspToolInput } | { ok: false; error: string } {
  if (!hasPosition(input)) {
    return {
      ok: false,
      error: `${input.operation} requires filePath, line, and character.`,
    };
  }

  return {
    ok: true,
    value: input as LspToolInput,
  };
}

function getTextDocumentIdentifier(filePath: string): { uri: string } {
  return {
    uri: pathToFileURL(filePath).href,
  };
}

function summarizeRunOutcomes(outcomes: Array<{ ok: boolean; error?: LspStructuredError; timedOut?: boolean }>): {
  errors: LspStructuredError[];
  timedOut: boolean;
} {
  const errors: LspStructuredError[] = [];
  let timedOut = false;

  for (const outcome of outcomes) {
    if (!outcome.ok && outcome.error) {
      errors.push(outcome.error);
      if (outcome.timedOut || outcome.error.code === "ETIMEDOUT") {
        timedOut = true;
      }
    }
  }

  return {
    errors,
    timedOut,
  };
}

function formatOutput(operation: LspOperation, result: unknown[]): string {
  if (result.length === 0) {
    return `No results found for ${operation}`;
  }
  return JSON.stringify(result, null, 2);
}

function mapResponse(args: {
  operation: LspOperation;
  result: unknown[];
  summary: LspRunSummary<unknown>;
  warnings: string[];
}) {
  const runDiagnostics = summarizeRunOutcomes(args.summary.outcomes);

  return {
    content: [{ type: "text" as const, text: formatOutput(args.operation, args.result) }],
    details: {
      operation: args.operation,
      result: args.result,
      errors: runDiagnostics.errors,
      timedOut: runDiagnostics.timedOut,
      partial: runDiagnostics.errors.length > 0 && args.result.length > 0,
      warnings: args.warnings,
    },
  };
}

function collectSuccessfulValues(summary: LspRunSummary<unknown>): unknown[] {
  return summary.outcomes
    .filter((outcome) => outcome.ok)
    .map((outcome) => outcome.value);
}

export function registerLspTool(pi: ExtensionAPI, runtime: LspRuntime) {
  pi.registerTool({
    name: "lsp",
    label: "LSP",
    description: [
      "Interact with Language Server Protocol (LSP) servers to get code intelligence features.",
      "",
      "Supported operations:",
      "- goToDefinition: Find where a symbol is defined",
      "- findReferences: Find all references to a symbol",
      "- hover: Get hover information (documentation, type info) for a symbol",
      "- documentSymbol: Get all symbols (functions, classes, variables) in a document",
      "- workspaceSymbol: Search for symbols across the entire workspace",
      "- goToImplementation: Find implementations of an interface or abstract method",
      "- prepareCallHierarchy: Get call hierarchy item at a position (functions/methods)",
      "- incomingCalls: Find all functions/methods that call the function at a position",
      "- outgoingCalls: Find all functions/methods called by the function at a position",
      "",
      "All operations require:",
      "- filePath: The file to operate on",
      "- line: The line number (1-based, as shown in editors)",
      "- character: The character offset (1-based, as shown in editors)",
      "",
      "Note: LSP servers must be configured for the file type. If no server is available, an error will be returned.",
    ].join("\n"),
    parameters: LspToolParametersSchema,
    async execute(_toolCallId, params, signal, _onUpdate, ctx: ExtensionContext) {
      runtime.setCwd(ctx.cwd);

      const validated = validateOperationInput(params as LspToolParameters);
      if (!validated.ok) {
        throw new Error(validated.error);
      }

      const input = validated.value;

      const normalized = normalizeToolPath(input.filePath, {
        cwd: ctx.cwd,
        boundaryRoots: runtime.getBoundaryRoots(),
        allowExternalPaths: runtime.getAllowExternalPaths(),
        requireReadableFile: false,
      });
      const filePath = normalized.realPath;

      if (!existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const hasClient = await runtime.hasAvailableClientForFile(filePath);
      if (!hasClient) {
        throw new Error("No LSP server available for this file type.");
      }

      await runtime.touchFile(filePath, true, signal).catch(() => {
        // Warm state before requests, but don't fail on touch timing issues.
      });

      const position = toProtocolPosition(input.line, input.character);
      const warnings = runtime.getWarnings();

      switch (input.operation) {
        case "goToDefinition":
        case "findReferences":
        case "goToImplementation": {
          const method = input.operation === "goToDefinition"
            ? "textDocument/definition"
            : input.operation === "findReferences"
              ? "textDocument/references"
              : "textDocument/implementation";

          const summary = await runtime.run(filePath, async (client: LspClient) => {
            return await client.request(method, {
              textDocument: getTextDocumentIdentifier(filePath),
              position,
              context: input.operation === "findReferences" ? { includeDeclaration: true } : undefined,
            }, { signal }).catch(() => input.operation === "findReferences" ? [] : null);
          });

          const result = collectSuccessfulValues(summary)
            .flatMap((value) => Array.isArray(value) ? value : value ? [value] : [])
            .filter(Boolean);

          return mapResponse({
            operation: input.operation,
            result,
            summary,
            warnings,
          });
        }

        case "hover": {
          const summary = await runtime.run(filePath, async (client: LspClient) => {
            return await client.request("textDocument/hover", {
              textDocument: getTextDocumentIdentifier(filePath),
              position,
            }, { signal }).catch(() => null);
          });

          const result = collectSuccessfulValues(summary);

          return mapResponse({
            operation: input.operation,
            result,
            summary,
            warnings,
          });
        }

        case "documentSymbol": {
          const summary = await runtime.run(filePath, async (client: LspClient) => {
            return await client.request("textDocument/documentSymbol", {
              textDocument: getTextDocumentIdentifier(filePath),
            }, { signal }).catch(() => []);
          });

          const result = collectSuccessfulValues(summary)
            .flatMap((value) => Array.isArray(value) ? value : [])
            .filter(Boolean);

          return mapResponse({
            operation: input.operation,
            result,
            summary,
            warnings,
          });
        }

        case "workspaceSymbol": {
          const summary = await runtime.runAll(async (client: LspClient) => {
            const symbols = await client.request("workspace/symbol", {
              query: "",
            }, { signal }).catch(() => []);

            if (!Array.isArray(symbols)) {
              return [];
            }

            return symbols
              .filter((symbol) => {
                const kind = (symbol as { kind?: unknown })?.kind;
                return typeof kind === "number" && WORKSPACE_SYMBOL_KINDS.has(kind);
              })
              .slice(0, 10);
          });

          const result = collectSuccessfulValues(summary)
            .flatMap((value) => Array.isArray(value) ? value : [])
            .filter(Boolean);

          return mapResponse({
            operation: input.operation,
            result,
            summary,
            warnings,
          });
        }

        case "prepareCallHierarchy": {
          const summary = await runtime.run(filePath, async (client: LspClient) => {
            return await client.request("textDocument/prepareCallHierarchy", {
              textDocument: getTextDocumentIdentifier(filePath),
              position,
            }, { signal }).catch(() => []);
          });

          const result = collectSuccessfulValues(summary)
            .flatMap((value) => Array.isArray(value) ? value : [])
            .filter(Boolean);

          return mapResponse({
            operation: input.operation,
            result,
            summary,
            warnings,
          });
        }

        case "incomingCalls":
        case "outgoingCalls": {
          const method = input.operation === "incomingCalls"
            ? "callHierarchy/incomingCalls"
            : "callHierarchy/outgoingCalls";

          const summary = await runtime.run(filePath, async (client: LspClient) => {
            const prepared = await client.request("textDocument/prepareCallHierarchy", {
              textDocument: getTextDocumentIdentifier(filePath),
              position,
            }, { signal }).catch(() => []);

            if (!Array.isArray(prepared) || prepared.length === 0) {
              return [];
            }

            return await client.request(method, {
              item: prepared[0],
            }, { signal }).catch(() => []);
          });

          const result = collectSuccessfulValues(summary)
            .flatMap((value) => Array.isArray(value) ? value : [])
            .filter(Boolean);

          return mapResponse({
            operation: input.operation,
            result,
            summary,
            warnings,
          });
        }
      }
    },
  });
}
