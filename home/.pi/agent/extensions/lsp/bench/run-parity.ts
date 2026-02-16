import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const resultsDir = resolve(import.meta.dir, "results");
mkdirSync(resultsDir, { recursive: true });

async function runScript(path: string, args: string[] = []): Promise<string> {
  const proc = Bun.spawn(["bun", "run", path, ...args], {
    cwd: import.meta.dir,
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    throw new Error(`Command failed (${path}): ${stderr || stdout}`);
  }

  return stdout;
}

async function main() {
  const benchRaw = await runScript("./run-bench.ts");
  const baselineRaw = await runScript("./capture-opencode-baseline.ts");

  const benchPath = join(resultsDir, "pi-bench.json");
  const baselinePath = join(resultsDir, "opencode-baseline.json");
  writeFileSync(benchPath, benchRaw, "utf8");
  writeFileSync(baselinePath, baselineRaw, "utf8");

  const parityRaw = await runScript("./parity-report.ts", [benchPath, baselinePath]);
  const parityPath = join(resultsDir, "parity-report.json");
  writeFileSync(parityPath, parityRaw, "utf8");

  console.log(`Wrote benchmark artifacts:`);
  console.log(`- ${benchPath}`);
  console.log(`- ${baselinePath}`);
  console.log(`- ${parityPath}`);
}

void main();
