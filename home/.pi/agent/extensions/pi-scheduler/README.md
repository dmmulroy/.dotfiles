# Pi Scheduler

Durable recurring Pi tasks for macOS. Jobs live in owner-only SQLite state and run in isolated, ephemeral `pi --mode json` processes supervised independently from the daemon.

## Setup

In interactive Pi:

```text
/schedule setup
```

Setup generates `~/Library/LaunchAgents/dev.dmmulroy.pi-scheduler.plist`, starts the daemon, and verifies persisted background authentication. It never sources shell configuration or stores credentials in the plist.

## Commands

```text
/schedule health
/schedule add
/schedule list
/schedule inbox
/schedule inspect <job-or-run-id>
/schedule edit <job-id>
/schedule pause <job-id>
/schedule resume <job-id>
/schedule run <job-id>
/schedule cancel <run-id>
/schedule delete <job-id>
```

The optional `scheduled_task` model tool requires interactive approval for every mutation and is disabled in scheduled workers.

## CLI

```sh
pi-scheduler list
pi-scheduler create \
  --name review \
  --prompt 'Review open work' \
  --interval 1h \
  --cwd "$PWD" \
  --provider <provider> \
  --model <model>
```

Tools default to `read,grep,find,ls`. Any other exact tool name requires `--approve-elevated-tools` in the CLI or an explicit warning/confirmation in Pi.

## Runtime state

```text
~/.pi/agent/scheduler/
├── scheduler.sqlite
├── scheduler.sock
├── daemon.lock
├── daemon.log
└── runs/<run-id>/
```

Terminal runs are retained for 30 days and at most 100 per job. Full event logs are retained for 7 days and at most 20 per job.

## Development

```sh
cd ~/.pi
npm run check --workspace=pi-scheduler-extension
```
