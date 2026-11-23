# transfer_pi_session

Moves the pi session in a Rex pane, with its working tree, to another Rex host.

Rex can't move a running process, so a transfer is: wait for pi to be at rest,
snapshot the working tree, copy it and the transcript over ssh, start
`pi --fork <transcript>` in a new tab on the target, check it came up, then close
the source pane.

## Use

| From | How |
| --- | --- |
| Rex palette | **Transfer pi Session to Host…** |
| pi | `/transfer [host]` |
| CLI | `rex do transfer_pi_session host=exe-dev-box` |
| Worker directly | `rex do run.lua block_id=<pane> host=<label>` |

Options: `dry_run=true` (print the plan), `keep_source=true` (leave the source
pane open), `fresh=true` (don't resume an unfinished transfer).

Running a failed transfer again resumes it; finished steps are skipped.

## Requirements

- The target is a Rex host with an `ssh://` endpoint, reachable without a prompt.
- pi on the target is the same version or newer, and can start: its extensions'
  dependencies are installed (`dot init`/`dot update`) and a provider is logged in.
- The pi extension `home/.pi/agent/extensions/rex-transfer.ts` is loaded on both sides.
- git repositories: the target directory is absent, or a clean checkout whose
  branch has nothing the source lacks. Other directories: absent or empty.

## What moves

| Moves | Doesn't |
| --- | --- |
| The whole transcript | Ignored files (`.env`, `node_modules`) |
| Committed history the target lacks | Stashes, and which changes were staged |
| Uncommitted and untracked changes | Background processes the session started |
| The branch name | Provider logins and pi settings |

Paths under the source's home are mapped under the target's home; other paths
keep their place.

## Layout

```
transfer_pi_session/
├── init.lua       # Rex action: choose pane and host, start the worker pane
├── run.lua        # worker (`rex do`): plan, then run the steps
├── plan.lua       # preflight; builds the immutable plan or fails. Reads only
├── steps.lua      # the nine steps, each with a `done` probe
├── runner.lua     # runs steps against the journal
├── journal.lua    # ~/.local/state/pi-transfer/journal/<id>.json
├── path_map.lua, shell.lua, pi_sidecar.lua   # small pure helpers
├── types.lua      # LuaLS annotations only
├── ports/         # everything that touches the outside world
│   ├── rex_port.lua         # every Rex API call
│   ├── pi_agent.lua         # every assumption about pi
│   ├── ssh_transport.lua    # run a script on a host, copy a file
│   ├── git_workspace.lua    # snapshot commit, push, restore
│   └── plain_workspace.lua  # rsync, for directories outside git
└── tests/
    ├── run.lua    # unit tests with fake ports: `rex do tests/run.lua`
    └── e2e.sh     # real transfer of a throwaway repo: `tests/e2e.sh <host>`
```

## Rules to keep

- **The source is read-only until `handover`.** The git snapshot is built in a
  temporary index; the only things added are git objects and one ref.
- **Every step's `done` probes the world**, not the journal, and every artifact
  is named by the transfer ID, so a rerun is safe.
- **The plan is never recomputed on resume.**
- **Rex calls go in `ports/rex_port.lua`, pi assumptions in `ports/pi_agent.lua`.**
  When a Rex or pi upgrade breaks a transfer, the fix belongs in one of them.
- **Remote commands are sh scripts on stdin** (`ssh host sh -s`), with values as
  quoted assignments. The target's login shell may be fish.

## Things that bit during development

- A Rex connection must `session.attach` before it calls a block method or
  changes a session, even one it just created; otherwise the call fails with
  `409 stream is not attached`. `rex_port.lua` attaches once per session.
- pi writes a session file only after the first assistant reply.
- In the long unit-test script, a top-level local updated from closures read
  stale under `rex do`. The tests keep such state in table fields. A short
  script doesn't reproduce it, so the cause is unknown; avoid the pattern.
- `session.select` (showing the target session in the app) needs a connected app
  with Remote Control on. Without it the worker prints where to go instead.
  It has not yet been confirmed to work for a session on another host.
