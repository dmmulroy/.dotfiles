import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  truncateHead,
} from "@mariozechner/pi-coding-agent";
import { StringEnum } from "@mariozechner/pi-ai";
import { Type, type Static } from "@sinclair/typebox";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const AST_GREP_LANGUAGES = [
  "typescript",
  "tsx",
  "javascript",
  "python",
  "rust",
  "go",
  "java",
  "c",
  "cpp",
  "csharp",
  "kotlin",
  "swift",
  "ruby",
  "lua",
  "elixir",
  "html",
  "css",
  "json",
  "yaml",
] as const;

const AstGrepSearchParamsSchema = Type.Object({
  pattern: Type.String({ description: "AST pattern to match" }),
  path: Type.Optional(Type.String({ description: "Path to search (default: .)" })),
  lang: Type.Optional(
    StringEnum(AST_GREP_LANGUAGES, {
      description: "Language (auto-detected if omitted)",
    }),
  ),
  json: Type.Optional(Type.Boolean({ description: "Output as JSON" })),
});

const AstGrepRewriteParamsSchema = Type.Object({
  pattern: Type.String({ description: "AST pattern to match" }),
  rewrite: Type.String({ description: "Replacement pattern (use same metavariables)" }),
  path: Type.Optional(Type.String({ description: "Path to transform (default: .)" })),
  lang: Type.Optional(
    StringEnum(AST_GREP_LANGUAGES, {
      description: "Language hint",
    }),
  ),
});

type AstGrepSearchParams = Static<typeof AstGrepSearchParamsSchema>;
type AstGrepRewriteParams = Static<typeof AstGrepRewriteParamsSchema>;

interface AstGrepToolDetails {
  command: "sg";
  args: string[];
  cwd: string;
  exitCode: number;
  stderr?: string;
  truncated?: boolean;
  fullOutputPath?: string;
}

interface NormalizedOutput {
  output: string;
  truncated: boolean;
  fullOutputPath?: string;
}

function normalizePath(rawPath: string | undefined): string {
  if (!rawPath) {
    return ".";
  }

  const trimmed = rawPath.trim();
  if (!trimmed || trimmed === "@") {
    return ".";
  }

  if (trimmed.startsWith("@")) {
    return trimmed.slice(1) || ".";
  }

  return trimmed;
}

function truncateOutputIfNeeded(output: string, tempPrefix: string): NormalizedOutput {
  const truncation = truncateHead(output, {
    maxLines: DEFAULT_MAX_LINES,
    maxBytes: DEFAULT_MAX_BYTES,
  });

  if (!truncation.truncated) {
    return {
      output: truncation.content,
      truncated: false,
    };
  }

  const tempDir = mkdtempSync(join(tmpdir(), tempPrefix));
  const tempFile = join(tempDir, "full-output.txt");
  writeFileSync(tempFile, output, "utf8");

  return {
    output:
      truncation.content +
      `\n\n[Output truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines ` +
      `(${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}). ` +
      `Full output saved to: ${tempFile}]`,
    truncated: true,
    fullOutputPath: tempFile,
  };
}

async function runAstGrep(
  pi: ExtensionAPI,
  args: string[],
  options: {
    cwd: string;
    signal?: AbortSignal;
    emptyMessage: string;
    tempPrefix: string;
  },
): Promise<{ output: string; details: AstGrepToolDetails; }> {
  const result = await pi.exec("sg", args, {
    cwd: options.cwd,
    signal: options.signal,
  });

  const stderr = result.stderr.trim();
  if (result.code !== 0 && stderr) {
    throw new Error(stderr);
  }

  const rawOutput = result.stdout.trim().length > 0 ? result.stdout : options.emptyMessage;
  const normalized = truncateOutputIfNeeded(rawOutput, options.tempPrefix);

  const details: AstGrepToolDetails = {
    command: "sg",
    args,
    cwd: options.cwd,
    exitCode: result.code,
  };

  if (stderr.length > 0) {
    details.stderr = stderr;
  }

  if (normalized.truncated) {
    details.truncated = true;
    details.fullOutputPath = normalized.fullOutputPath;
  }

  return {
    output: normalized.output,
    details,
  };
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "ast_grep_search",
    label: "AST Grep Search",
    description:
      `Search code using ast-grep's structural AST pattern matching. ` +
      `Use this for format-agnostic structural matches. ` +
      `Output is truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)}.\n\n` +
      `Metavariables:\n` +
      `- $VAR: matches single AST node\n` +
      `- $$$VAR: matches zero or more nodes\n\n` +
      `Examples:\n` +
      `- console.log($$$ARGS)\n` +
      `- useState($INIT)\n` +
      `- async function $NAME($$$PARAMS) { $$$BODY }`,
    parameters: AstGrepSearchParamsSchema,
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const input = params as AstGrepSearchParams;
      const args = ["--pattern", input.pattern];
      if (input.lang) {
        args.push("--lang", input.lang);
      }
      if (input.json) {
        args.push("--json");
      }
      args.push(normalizePath(input.path));

      onUpdate?.({
        content: [{ type: "text", text: "Running ast-grep search..." }],
        details: { phase: "searching" },
      });

      const { output, details } = await runAstGrep(pi, args, {
        cwd: ctx.cwd,
        signal,
        emptyMessage: "No matches found.",
        tempPrefix: "pi-ast-grep-search-",
      });

      return {
        content: [{ type: "text", text: output }],
        details,
      };
    },
  });

  pi.registerTool({
    name: "ast_grep_rewrite",
    label: "AST Grep Rewrite",
    description:
      `Transform code using ast-grep pattern matching. ` +
      `Rewrites all matches with the replacement pattern and updates files in place. ` +
      `Output is truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)}.\n\n` +
      `Example: pattern="console.log($MSG)" rewrite="logger.info($MSG)"`,
    parameters: AstGrepRewriteParamsSchema,
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const input = params as AstGrepRewriteParams;
      const args = [
        "--pattern",
        input.pattern,
        "--rewrite",
        input.rewrite,
        "--update-all",
      ];
      if (input.lang) {
        args.push("--lang", input.lang);
      }
      args.push(normalizePath(input.path));

      onUpdate?.({
        content: [{ type: "text", text: "Running ast-grep rewrite..." }],
        details: { phase: "rewriting" },
      });

      const { output, details } = await runAstGrep(pi, args, {
        cwd: ctx.cwd,
        signal,
        emptyMessage: "No changes needed.",
        tempPrefix: "pi-ast-grep-rewrite-",
      });

      return {
        content: [{ type: "text", text: output }],
        details,
      };
    },
  });
}
