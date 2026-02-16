import { readFileSync } from "node:fs";

interface PiBenchResult {
  aggregate: {
    warmP50Ms: number;
    warmP95Ms: number;
    coldFirstRequestMs: number;
    editToDiagnosticsP95Ms: number;
    leakedProcesses: number;
    diagnosticsSummaryChars: number;
  };
}

interface BaselineResult {
  baseline: {
    warmP50Ms: number;
    warmP95Ms: number;
    coldFirstRequestMs: number;
    editToDiagnosticsP95Ms: number;
    diagnosticsSummaryChars: number;
  };
}

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function main() {
  const piPath = process.argv[2];
  const baselinePath = process.argv[3];

  if (!piPath || !baselinePath) {
    console.error("Usage: bun run parity-report.ts <pi-bench.json> <baseline.json>");
    process.exit(1);
  }

  const pi = loadJson<PiBenchResult>(piPath);
  const baselineWrapped = loadJson<BaselineResult | BaselineResult["baseline"]>(baselinePath);
  const baseline = "baseline" in baselineWrapped ? baselineWrapped.baseline : baselineWrapped;

  const checks = {
    warmP50: pi.aggregate.warmP50Ms <= baseline.warmP50Ms * 1.05,
    warmP95: pi.aggregate.warmP95Ms <= baseline.warmP95Ms * 1.05,
    cold: pi.aggregate.coldFirstRequestMs <= baseline.coldFirstRequestMs * 1.1,
    editP95: pi.aggregate.editToDiagnosticsP95Ms <= 3500,
    noLeaks: pi.aggregate.leakedProcesses === 0,
    summaryBudget: pi.aggregate.diagnosticsSummaryChars <= 2048,
  };

  const report = {
    generatedAt: Date.now(),
    pi: pi.aggregate,
    baseline,
    checks,
    passed: Object.values(checks).every(Boolean),
  };

  console.log(JSON.stringify(report, null, 2));
}

main();
