import { spawn } from "node:child_process";

import {
  hasTrustRequiringProjectResources,
  ProjectTrustStore,
} from "@earendil-works/pi-coding-agent";

import type { AbsolutePath, PinnedModel } from "./domain.ts";
import {
  BackgroundAuthenticationError,
  ModelUnavailableError,
  ProjectTrustRequiredError,
} from "./errors.ts";
import { failure, success, type Result } from "./result.ts";
import type { BackgroundAuthProbe, ModelAvailabilityProbe, ProjectTrustProbe } from "./service.ts";

/** Saved Pi trust adapter; it never grants temporary trust or passes `--approve`. */
export class PiProjectTrustProbe implements ProjectTrustProbe {
  readonly #store: ProjectTrustStore;

  /** Read trust decisions from Pi's owner-local agent directory. */
  constructor(agentDirectory: string) {
    this.#store = new ProjectTrustStore(agentDirectory);
  }

  /** Require a saved positive decision only when Pi detects trust-gated resources. */
  verify(cwd: AbsolutePath): Result<void, ProjectTrustRequiredError> {
    if (!hasTrustRequiringProjectResources(cwd) || this.#store.get(cwd) === true) return success(undefined);
    return failure(new ProjectTrustRequiredError());
  }
}

/** Pi subprocess adapter that includes dynamically registered extension providers. */
export class PiModelAvailabilityProbe implements ModelAvailabilityProbe {
  /** Construct a model probe over the resolved Pi executable. */
  constructor(readonly piPath: string) {}

  /** Ask Pi's complete runtime catalog for the exact provider/model pair. */
  async verify(model: PinnedModel): Promise<Result<void, ModelUnavailableError>> {
    return new Promise((resolve) => {
      const child = spawn(this.piPath, ["--list-models", `${model.provider}/${model.modelId}`], {
        env: { ...process.env, PI_SKIP_VERSION_CHECK: "1" },
        stdio: ["ignore", "pipe", "ignore"],
      });
      let output = "";
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        if (output.length < 1_000_000) output += chunk;
      });
      child.once("error", () => resolve(failure(new ModelUnavailableError())));
      child.once("close", (code) => resolve(code === 0 && output.includes(model.modelId) ? success(undefined) : failure(new ModelUnavailableError())));
    });
  }
}

/** Real minimal Pi request used to verify persisted background authentication. */
export class PiBackgroundAuthProbe implements BackgroundAuthProbe {
  /** Construct a probe over a resolved Pi executable and launchd-like environment. */
  constructor(
    readonly piPath: string,
    readonly environment: NodeJS.ProcessEnv = {
      HOME: process.env.HOME,
      TMPDIR: process.env.TMPDIR,
      PATH: process.env.PATH,
      PI_SKIP_VERSION_CHECK: "1",
    },
  ) {}

  /** Execute a no-tool, ephemeral request with the exact pinned model and no trust override. */
  async verify(model: PinnedModel): Promise<Result<void, BackgroundAuthenticationError>> {
    return new Promise((resolve) => {
      const child = spawn(this.piPath, [
        "--mode", "json", "--no-session", "--provider", model.provider,
        "--model", model.modelId, "--thinking", model.thinkingLevel, "--no-tools",
      ], { env: this.environment, stdio: ["pipe", "ignore", "ignore"] });
      const timeout = setTimeout(() => child.kill("SIGKILL"), 30_000);
      child.once("error", () => {
        clearTimeout(timeout);
        resolve(failure(new BackgroundAuthenticationError()));
      });
      child.once("close", (code) => {
        clearTimeout(timeout);
        resolve(code === 0 ? success(undefined) : failure(new BackgroundAuthenticationError()));
      });
      child.stdin.end("Reply with OK only.");
    });
  }
}
