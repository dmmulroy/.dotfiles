import type { ExecOptions, ExecResult, ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Executes argument-safe commands for the worktree application service. */
export interface WorktreeCommandRunner {
  /** Run one command without shell interpolation. */
  run(command: string, args: ReadonlyArray<string>, options?: ExecOptions): Promise<ExecResult>;
}

/** Adapts Pi's cancellable process execution API to worktree operations. */
export class PiWorktreeCommandRunner implements WorktreeCommandRunner {
  constructor(private readonly pi: ExtensionAPI) {}

  /** Run a worktree command through Pi's process executor. */
  run(command: string, args: ReadonlyArray<string>, options?: ExecOptions): Promise<ExecResult> {
    return this.pi.exec(command, [...args], options);
  }
}
