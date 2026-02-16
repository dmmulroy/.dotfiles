import { existsSync, readFileSync } from "node:fs";

interface BaselineMetrics {
  warmP50Ms: number;
  warmP95Ms: number;
  coldFirstRequestMs: number;
  editToDiagnosticsP95Ms: number;
  diagnosticsSummaryChars: number;
}

const DEFAULT_BASELINE: BaselineMetrics = {
  warmP50Ms: 55,
  warmP95Ms: 95,
  coldFirstRequestMs: 280,
  editToDiagnosticsP95Ms: 3200,
  diagnosticsSummaryChars: 1800,
};

function main() {
  const explicitPath = process.env.OPENCODE_BASELINE_FILE;
  if (explicitPath && existsSync(explicitPath)) {
    const parsed = JSON.parse(readFileSync(explicitPath, "utf8"));
    console.log(JSON.stringify({ source: "file", baseline: parsed }, null, 2));
    return;
  }

  // Placeholder capture for parity harness environments where OpenCode CLI is not available.
  console.log(JSON.stringify({ source: "default", baseline: DEFAULT_BASELINE }, null, 2));
}

main();
