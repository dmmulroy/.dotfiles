import type { TextContent } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ToolResultEvent } from "@mariozechner/pi-coding-agent";
import type { LspRuntime } from "./runtime.js";
import { normalizeToolPath } from "./tool.js";
import type { LspDiagnostic, LspHookSummaryOptions } from "./types.js";

const DEFAULT_SUMMARY_OPTIONS: LspHookSummaryOptions = {
  relatedFilesLimit: 3,
  diagnosticsPerFileLimit: 5,
  maxChars: 2_048,
};

const APPLY_PATCH_TOOL_NAMES = [
  "apply_patch",
  "applyPatch",
  "apply-patch",
];

function extractTextContent(event: ToolResultEvent): string {
  return event.content
    .filter((part): part is TextContent => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

function parsePatchPaths(text: string): string[] {
  const paths = new Set<string>();

  const markers = [
    /^\*\*\*\s+(?:Update|Add|Delete)\s+File:\s+(.+)$/gm,
    /^\+\+\+\s+b\/(.+)$/gm,
    /^---\s+a\/(.+)$/gm,
  ];

  for (const marker of markers) {
    marker.lastIndex = 0;
    for (const match of text.matchAll(marker)) {
      const path = match[1]?.trim();
      if (!path) continue;
      if (path === "/dev/null") continue;
      paths.add(path);
    }
  }

  return [...paths];
}

function extractChangedPaths(event: ToolResultEvent): string[] {
  const paths = new Set<string>();
  const input = event.input as Record<string, unknown>;

  if (event.toolName === "write" || event.toolName === "edit") {
    if (typeof input.path === "string") {
      paths.add(input.path);
    }
    return [...paths];
  }

  const isApplyPatchCompatible = APPLY_PATCH_TOOL_NAMES.includes(event.toolName)
    || event.toolName.includes("patch");

  if (!isApplyPatchCompatible) {
    return [];
  }

  if (typeof input.path === "string") {
    paths.add(input.path);
  }
  if (typeof input.filePath === "string") {
    paths.add(input.filePath);
  }

  if (Array.isArray(input.paths)) {
    for (const path of input.paths) {
      if (typeof path === "string") {
        paths.add(path);
      }
    }
  }

  if (Array.isArray(input.files)) {
    for (const path of input.files) {
      if (typeof path === "string") {
        paths.add(path);
      }
    }
  }

  const details = event.details as { files?: string[]; paths?: string[] } | undefined;
  if (details?.files) {
    for (const path of details.files) {
      paths.add(path);
    }
  }

  if (details?.paths) {
    for (const path of details.paths) {
      paths.add(path);
    }
  }

  const text = extractTextContent(event);
  for (const path of parsePatchPaths(text)) {
    paths.add(path);
  }

  return [...paths];
}

function severityWeight(severity?: number): number {
  switch (severity) {
    case 1:
      return 400;
    case 2:
      return 300;
    case 3:
      return 200;
    case 4:
      return 100;
    default:
      return 150;
  }
}

function severityLabel(severity?: number): string {
  switch (severity) {
    case 1:
      return "error";
    case 2:
      return "warning";
    case 3:
      return "info";
    case 4:
      return "hint";
    default:
      return "info";
  }
}

function sortDiagnostics(diagnostics: LspDiagnostic[]): LspDiagnostic[] {
  return [...diagnostics].sort((left, right) => {
    const severityDiff = severityWeight(right.severity) - severityWeight(left.severity);
    if (severityDiff !== 0) return severityDiff;

    const leftStart = left.range?.start;
    const rightStart = right.range?.start;
    const lineDiff = (leftStart?.line ?? 0) - (rightStart?.line ?? 0);
    if (lineDiff !== 0) return lineDiff;

    const characterDiff = (leftStart?.character ?? 0) - (rightStart?.character ?? 0);
    if (characterDiff !== 0) return characterDiff;

    return left.message.localeCompare(right.message);
  });
}

function formatFileDiagnostics(filePath: string, diagnostics: LspDiagnostic[], maxDiagnostics: number): string[] {
  const lines: string[] = [];

  const errorCount = diagnostics.filter((diagnostic) => diagnostic.severity === 1).length;
  const warningCount = diagnostics.filter((diagnostic) => diagnostic.severity === 2).length;

  lines.push(`${filePath} (${errorCount} errors, ${warningCount} warnings, ${diagnostics.length} total)`);

  const sorted = sortDiagnostics(diagnostics).slice(0, maxDiagnostics);
  for (const diagnostic of sorted) {
    const line = (diagnostic.range?.start?.line ?? 0) + 1;
    const character = (diagnostic.range?.start?.character ?? 0) + 1;
    const source = diagnostic.source ? `${diagnostic.source}: ` : "";
    lines.push(`  - [${severityLabel(diagnostic.severity)}] ${line}:${character} ${source}${diagnostic.message}`);
  }

  if (diagnostics.length > maxDiagnostics) {
    lines.push(`  - … ${diagnostics.length - maxDiagnostics} more`);
  }

  return lines;
}

function appendSummaryToContent(content: ToolResultEvent["content"], summary: string): ToolResultEvent["content"] {
  const nextContent = [...content];

  for (let i = nextContent.length - 1; i >= 0; i -= 1) {
    const part = nextContent[i];
    if (part?.type !== "text") {
      continue;
    }

    nextContent[i] = {
      ...part,
      text: `${part.text}\n\n${summary}`,
    };
    return nextContent;
  }

  nextContent.push({ type: "text", text: summary });
  return nextContent;
}

function truncateSummary(summary: string, maxChars: number): string {
  if (summary.length <= maxChars) {
    return summary;
  }

  return `${summary.slice(0, Math.max(0, maxChars - 1))}…`;
}

function buildDiagnosticsSummary(args: {
  diagnostics: Record<string, LspDiagnostic[]>;
  touchedFiles: string[];
  options: LspHookSummaryOptions;
  timedOut: boolean;
}): string | undefined {
  const touchedSet = new Set(args.touchedFiles);

  const touchedWithDiagnostics = args.touchedFiles
    .filter((path) => (args.diagnostics[path]?.length ?? 0) > 0);

  const relatedFiles = Object.entries(args.diagnostics)
    .filter(([path, diagnostics]) => !touchedSet.has(path) && diagnostics.length > 0)
    .sort((left, right) => {
      const leftScore = Math.max(...left[1].map((diagnostic) => severityWeight(diagnostic.severity)), 0);
      const rightScore = Math.max(...right[1].map((diagnostic) => severityWeight(diagnostic.severity)), 0);
      if (rightScore !== leftScore) return rightScore - leftScore;
      return right[1].length - left[1].length;
    })
    .slice(0, args.options.relatedFilesLimit)
    .map(([path]) => path);

  const selectedFiles = [...touchedWithDiagnostics, ...relatedFiles];
  if (selectedFiles.length === 0) {
    if (!args.timedOut) {
      return undefined;
    }

    return "LSP diagnostics summary: timed out waiting for fresh diagnostics; no diagnostics available yet.";
  }

  const lines: string[] = ["LSP diagnostics summary:"];
  for (const filePath of selectedFiles) {
    const fileDiagnostics = args.diagnostics[filePath] ?? [];
    lines.push(...formatFileDiagnostics(filePath, fileDiagnostics, args.options.diagnosticsPerFileLimit));
  }

  if (args.timedOut) {
    lines.push("Note: diagnostics wait timed out; summary is best effort from cached server state.");
  }

  return truncateSummary(lines.join("\n"), args.options.maxChars);
}

export function registerLspHooks(pi: ExtensionAPI, runtime: LspRuntime) {
  pi.on("tool_result", async (event, ctx) => {
    runtime.setCwd(ctx.cwd);

    if (event.toolName === "read") {
      const path = (event.input as Record<string, unknown>).path;
      if (typeof path !== "string") {
        return;
      }

      try {
        const normalized = normalizeToolPath(path, {
          cwd: ctx.cwd,
          boundaryRoots: runtime.getBoundaryRoots(),
          allowExternalPaths: runtime.getAllowExternalPaths(),
          requireReadableFile: true,
        });

        void runtime.touchFile(normalized.realPath, false).catch(() => {
          // Warm path is best effort.
        });
      } catch {
        // Ignore warm failures.
      }

      return;
    }

    if (event.toolName !== "write" && event.toolName !== "edit" && !event.toolName.includes("patch")) {
      return;
    }

    if (event.isError) {
      return;
    }

    const rawPaths = extractChangedPaths(event);
    if (rawPaths.length === 0) {
      return;
    }

    const normalizedPaths: string[] = [];
    for (const rawPath of rawPaths) {
      try {
        const normalized = normalizeToolPath(rawPath, {
          cwd: ctx.cwd,
          boundaryRoots: runtime.getBoundaryRoots(),
          allowExternalPaths: runtime.getAllowExternalPaths(),
          requireReadableFile: true,
        });
        normalizedPaths.push(normalized.realPath);
      } catch {
        // Skip invalid paths from patch metadata.
      }
    }

    if (normalizedPaths.length === 0) {
      return;
    }

    let timedOut = false;
    for (const path of normalizedPaths) {
      const touch = await runtime.touchFile(path, true);
      timedOut ||= touch.timedOut;
    }

    const diagnostics = runtime.diagnostics();
    const summary = buildDiagnosticsSummary({
      diagnostics,
      touchedFiles: [...new Set(normalizedPaths)],
      options: DEFAULT_SUMMARY_OPTIONS,
      timedOut,
    });

    if (!summary) {
      return;
    }

    return {
      content: appendSummaryToContent(event.content, summary),
    };
  });

  // Side-effect-only hook by contract.
  pi.on("tool_execution_end", async (_event, _ctx) => {
    // Reserved for telemetry or background refreshes.
  });
}
