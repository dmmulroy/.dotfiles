# Cloudflare deployment guard

Pi extension that holds agent `bash` commands which deploy Cloudflare Workers or Alchemy stacks to the
allowlist in `agent/cloudflare-deployment-allowlist.json` (never edited by the agent), and blocks agent
writes to that file.

## How a command is decided

1. `shell-ast.ts` parses the command with mvdan/sh (`sh-syntax`, WASM) and walks every simple command that
   runs, in execution order, tracking the working directory (`cd`, `pushd`), exported variables, shell
   variables (`D=apps/api; cd $D`), `set -a`, and `source`. Heredoc bodies, quoted strings, and redirect
   targets are data; they are parsed as commands only when fed to a shell (`bash -c`, `sh <<EOF`, `eval`).
2. `evaluate.ts` classifies each command after stripping wrappers (`env`, `sudo`, `timeout`, `xargs`,
   `find -exec`, `doppler run --`):
   - Wrangler / cf / Alchemy, directly or through `npx`, `pnpm exec`, `vp exec`, … (`deploy-commands.ts`):
     `--help`/`--version` and dry runs pass; deploys resolve their Worker or Alchemy project and stage.
   - Package tasks (`package-scripts.ts`): `npm run`, `pnpm <script>`, `yarn [workspace]`, `bun run`,
     `vp run`/`vpr`. Runner built-ins (`vp test`, `pnpm install`, `pnpm deploy`) are not scripts. The
     script or Vite+ task command is evaluated recursively, with appended arguments.
   - Nested shells and shell script files are evaluated recursively; `node script.ts` is checked for
     code that spawns a deploy.
3. `policy.ts` authorizes the resolved target. An Alchemy project matches its entry from any git
   worktree of the same repository. Repositories holding an allowlisted Alchemy project are exempt,
   except for `alchemy destroy` and `wrangler delete`.

## Decisions

- **Definite denials** (unlisted Worker, project, or stage; destroy/delete, including
  `alchemy destroy --dry-run`; policy writes; a policy changed mid-session) always block.
- **Uncertain resolutions** (dynamic deploy arguments, `CLOUDFLARE_ENV`/`STAGE` from `source` or a
  secrets wrapper, a script piped into a shell, an unresolvable deploy-named task) ask the user with
  `ctx.ui.confirm` in interactive sessions and block in headless ones.
- Resolution failures for tasks whose name does not contain `deploy`/`destroy` are ignored.
- A stale Alchemy entry (project path gone) is skipped with a warning instead of invalidating the policy.
- The policy's content hash is recorded at `session_start`; a change during the session needs the user's
  confirmation before it is trusted.

## Checks

```bash
npm run check                          # typecheck + tests
npm run replay-sessions -- --show-blocks           # re-run every recorded block in ~/.pi/agent/sessions
npm run replay-sessions -- --strict --show-blocks  # same, without the repository exemption
```

`test/false-positive-regressions.test.ts` holds minimized reproductions of the false positives found by
auditing real sessions. Never commit replay output: session commands can contain private content.
