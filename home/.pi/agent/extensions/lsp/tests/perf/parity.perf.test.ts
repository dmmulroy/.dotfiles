import { describe, expect, test } from "bun:test";
import { join, resolve } from "node:path";
import { createTempDir } from "../helpers.js";

const benchDir = resolve(import.meta.dir, "../../bench");

describe("lsp parity benchmark harness", () => {
  test("run benchmark + baseline + parity report", async () => {
    const benchProcess = Bun.spawn(["bun", "run", "./run-bench.ts"], {
      cwd: benchDir,
      stdout: "pipe",
      stderr: "pipe",
    });
    const benchOut = await new Response(benchProcess.stdout).text();
    const benchErr = await new Response(benchProcess.stderr).text();
    const benchCode = await benchProcess.exited;

    expect(benchCode, benchErr).toBe(0);
    const bench = JSON.parse(benchOut) as { aggregate: { warmP50Ms: number; warmP95Ms: number; coldFirstRequestMs: number } };
    expect(bench.aggregate.warmP50Ms).toBeGreaterThanOrEqual(0);
    expect(bench.aggregate.warmP95Ms).toBeGreaterThanOrEqual(0);
    expect(bench.aggregate.coldFirstRequestMs).toBeGreaterThanOrEqual(0);

    const baselineProcess = Bun.spawn(["bun", "run", "./capture-opencode-baseline.ts"], {
      cwd: benchDir,
      stdout: "pipe",
      stderr: "pipe",
    });
    const baselineOut = await new Response(baselineProcess.stdout).text();
    const baselineCode = await baselineProcess.exited;
    expect(baselineCode).toBe(0);

    const tempResults = createTempDir("pi-lsp-perf-");
    const baselinePath = join(tempResults, "baseline-test.json");
    const benchPath = join(tempResults, "bench-test.json");
    await Bun.write(benchPath, benchOut);
    await Bun.write(baselinePath, baselineOut);

    const parityProcess = Bun.spawn(["bun", "run", "./parity-report.ts", benchPath, baselinePath], {
      cwd: benchDir,
      stdout: "pipe",
      stderr: "pipe",
    });
    const parityOut = await new Response(parityProcess.stdout).text();
    const parityCode = await parityProcess.exited;

    expect(parityCode).toBe(0);
    const parity = JSON.parse(parityOut) as { checks: Record<string, boolean>; passed: boolean };
    expect(Object.keys(parity.checks).length).toBeGreaterThan(0);
    expect(typeof parity.passed).toBe("boolean");
  });
});
