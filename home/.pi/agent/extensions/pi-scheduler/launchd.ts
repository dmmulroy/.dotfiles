import { spawn } from "node:child_process";
import { chmod, mkdir, open, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { BackgroundAuthenticationError } from "./errors.ts";
import { failure, success, type Result } from "./result.ts";

/** Stable launchd service label used by setup and diagnostics. */
export const LAUNCH_AGENT_LABEL = "dev.dmmulroy.pi-scheduler";

/** Resolved paths embedded in the generated owner-local LaunchAgent. */
export interface LaunchAgentConfiguration {
  readonly nodePath: string;
  readonly piPath: string;
  readonly daemonPath: string;
  readonly supervisorPath: string;
  readonly stateDirectory: string;
  readonly logPath: string;
}

function xml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

/** Render a launchd plist containing paths and non-secret scheduler configuration only. */
export function renderLaunchAgentPlist(configuration: LaunchAgentConfiguration): string {
  const item = (value: string) => `      <string>${xml(value)}</string>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCH_AGENT_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${item(configuration.nodePath)}
${item("--import")}
${item("tsx")}
${item(configuration.daemonPath)}
${item(configuration.stateDirectory)}
  </array>
  <key>WorkingDirectory</key>
  <string>${xml(dirname(configuration.daemonPath))}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PI_SCHEDULER_PI_PATH</key>
    <string>${xml(configuration.piPath)}</string>
    <key>PI_SCHEDULER_SUPERVISOR_PATH</key>
    <string>${xml(configuration.supervisorPath)}</string>
    <key>PI_SKIP_VERSION_CHECK</key>
    <string>1</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ProcessType</key>
  <string>Background</string>
  <key>StandardOutPath</key>
  <string>${xml(configuration.logPath)}</string>
  <key>StandardErrorPath</key>
  <string>${xml(configuration.logPath)}</string>
</dict>
</plist>
`;
}

/** Process result returned by the launchctl seam. */
export interface CommandResult {
  readonly code: number;
}

/** Minimal process seam used by LaunchAgent installation. */
export interface CommandRunner {
  run(command: string, args: readonly string[]): Promise<CommandResult>;
}

/** Real no-shell command runner. */
export class SpawnCommandRunner implements CommandRunner {
  /** Spawn an executable with exact arguments and discard arbitrary output. */
  async run(command: string, args: readonly string[]): Promise<CommandResult> {
    return new Promise((resolve) => {
      const child = spawn(command, [...args], { stdio: "ignore" });
      child.once("error", () => resolve({ code: 1 }));
      child.once("close", (code) => resolve({ code: code ?? 1 }));
    });
  }
}

/** launchd setup adapter with rollback on bootstrap or authentication failure. */
export class LaunchdInstaller {
  /** Construct an installer over an injectable launchctl process seam. */
  constructor(readonly runner: CommandRunner = new SpawnCommandRunner()) {}

  /** Write, bootstrap, and smoke-test the LaunchAgent; remove it on any failure. */
  async install(options: {
    readonly plistPath: string;
    readonly configuration: LaunchAgentConfiguration;
    readonly smokeTest: () => Promise<Result<void, BackgroundAuthenticationError>>;
  }): Promise<Result<void, BackgroundAuthenticationError>> {
    await mkdir(dirname(options.plistPath), { recursive: true, mode: 0o700 });
    await mkdir(options.configuration.stateDirectory, { recursive: true, mode: 0o700 });
    await chmod(options.configuration.stateDirectory, 0o700);
    const log = await open(options.configuration.logPath, "a", 0o600);
    await log.close();
    await chmod(options.configuration.logPath, 0o600);
    await writeFile(options.plistPath, renderLaunchAgentPlist(options.configuration), { encoding: "utf8", mode: 0o600 });
    await chmod(options.plistPath, 0o600);
    const domain = `gui/${process.getuid?.() ?? 0}`;
    await this.runner.run("/bin/launchctl", ["bootout", domain, options.plistPath]);
    const bootstrapped = await this.runner.run("/bin/launchctl", ["bootstrap", domain, options.plistPath]);
    if (bootstrapped.code !== 0) {
      await rm(options.plistPath, { force: true });
      return failure(new BackgroundAuthenticationError());
    }
    const smoke = await options.smokeTest();
    if (!smoke.ok) {
      await this.runner.run("/bin/launchctl", ["bootout", domain, options.plistPath]);
      await rm(options.plistPath, { force: true });
      await rm(`${options.configuration.stateDirectory}/scheduler.sock`, { force: true });
      return smoke;
    }
    return success(undefined);
  }

  /** Unload and remove the generated LaunchAgent. */
  async uninstall(plistPath: string): Promise<void> {
    const domain = `gui/${process.getuid?.() ?? 0}`;
    await this.runner.run("/bin/launchctl", ["bootout", domain, plistPath]);
    await rm(plistPath, { force: true });
  }
}
