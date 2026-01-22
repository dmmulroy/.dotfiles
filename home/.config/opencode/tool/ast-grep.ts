import { tool } from "@opencode-ai/plugin";

export const search = tool({
  description: `Search code using ast-grep's structural AST pattern matching.

Use for code patterns hard to match with regex (formatting-agnostic).

Metavariables:
- $VAR: matches single AST node
- $$$VAR: matches zero or more nodes

Examples:
- console.log($$$ARGS) - find all console.log calls
- useState($INIT) - find React useState
- async function $NAME($$$PARAMS) { $$$BODY } - find async functions`,

  args: {
    pattern: tool.schema.string().describe("AST pattern to match"),
    path: tool.schema
      .string()
      .optional()
      .describe("Path to search (default: .)"),
    lang: tool.schema
      .enum([
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
      ])
      .optional()
      .describe("Language (auto-detected if omitted)"),
    json: tool.schema.boolean().optional().describe("Output as JSON"),
  },

  async execute(args) {
    const cmd = ["sg", "--pattern", args.pattern];
    if (args.lang) cmd.push("--lang", args.lang);
    if (args.json) cmd.push("--json");
    cmd.push(args.path ?? ".");

    const result = await Bun.$`${cmd}`.nothrow().quiet();
    if (result.exitCode !== 0 && result.stderr.toString().trim()) {
      return `Error: ${result.stderr.toString()}`;
    }
    return result.stdout.toString() || "No matches found.";
  },
});

export const rewrite = tool({
  description: `Transform code using ast-grep pattern matching.

Rewrites matched patterns with replacement. Uses same metavariables from search pattern.

Example: pattern="console.log($MSG)" rewrite="logger.info($MSG)"`,

  args: {
    pattern: tool.schema.string().describe("AST pattern to match"),
    rewrite: tool.schema
      .string()
      .describe("Replacement pattern (use same metavariables)"),
    path: tool.schema
      .string()
      .optional()
      .describe("Path to transform (default: .)"),
    lang: tool.schema.string().optional().describe("Language hint"),
  },

  async execute(args) {
    const cmd = [
      "sg",
      "--pattern",
      args.pattern,
      "--rewrite",
      args.rewrite,
      "--update-all",
    ];
    if (args.lang) cmd.push("--lang", args.lang);
    cmd.push(args.path ?? ".");

    const result = await Bun.$`${cmd}`.nothrow().quiet();
    if (result.exitCode !== 0 && result.stderr.toString().trim()) {
      return `Error: ${result.stderr.toString()}`;
    }
    return result.stdout.toString() || "No changes needed.";
  },
});
