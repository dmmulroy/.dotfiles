import assert from "node:assert/strict";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { BackgroundAuthenticationError } from "../errors.ts";
import { LaunchdInstaller, renderLaunchAgentPlist, type CommandRunner } from "../launchd.ts";
import { failure } from "../result.ts";

test("launchd plist uses resolved paths without Fish or credentials", () => {
  const plist = renderLaunchAgentPlist({
    nodePath: "/opt/node/bin/node",
    piPath: "/opt/pi/bin/pi",
    daemonPath: "/Users/test/.pi/agent/extensions/pi-scheduler/daemon.ts",
    supervisorPath: "/Users/test/.pi/agent/extensions/pi-scheduler/worker-supervisor.ts",
    stateDirectory: "/Users/test/.pi/agent/scheduler",
    logPath: "/Users/test/.pi/agent/scheduler/daemon.log",
  });
  assert.match(plist, /\/opt\/node\/bin\/node/);
  assert.match(plist, /PI_SCHEDULER_PI_PATH/);
  assert.doesNotMatch(plist, /fish|secrets\.fish|API_KEY|TOKEN/iu);
  assert.doesNotMatch(plist, /--approve/);
});

test("setup rolls back a bootstrapped service when background authentication fails", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-scheduler-launchd-"));
  const calls: string[] = [];
  const runner: CommandRunner = {
    async run(command, args) {
      calls.push(`${command} ${args.join(" ")}`);
      return { code: 0 };
    },
  };
  const plistPath = join(directory, "LaunchAgents", "scheduler.plist");
  const stateDirectory = join(directory, "state");
  try {
    const result = await new LaunchdInstaller(runner).install({
      plistPath,
      configuration: {
        nodePath: "/opt/node/bin/node", piPath: "/opt/pi/bin/pi",
        daemonPath: "/opt/pi-scheduler/daemon.ts", supervisorPath: "/opt/pi-scheduler/worker-supervisor.ts",
        stateDirectory, logPath: join(stateDirectory, "daemon.log"),
      },
      async smokeTest() { return failure(new BackgroundAuthenticationError()); },
    });
    assert.equal(result.ok, false);
    assert.equal(calls.filter((call) => call.includes("bootout")).length, 2);
    await assert.rejects(access(plistPath));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
