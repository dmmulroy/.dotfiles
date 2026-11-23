-- Type annotations for transfer_pi_session (LuaLS). Never required: it holds no code.
-- Check with `lua-language-server --check .` from this folder.

---A Rex server and how to run commands on its machine.
---@class TransferHost
---@field label string          host label from `rex hosts`, or "local"
---@field is_local boolean      true for the machine the worker runs on
---@field name string           short hostname, for messages
---@field home string           the account's home directory there
---@field ssh TransferSsh?      nil for the local host

---@class TransferSsh
---@field dest string           "user@host" or "host"
---@field port integer?

---One agent conversation living in one Rex pane (from the sidecar the pi extension writes).
---@class AgentSession
---@field agent string          "pi"
---@field id string             session ID
---@field file string           transcript path (JSONL)
---@field cwd string            working directory the agent runs in
---@field block_id string       Rex block the agent runs in
---@field rex_session_id string Rex session of that block
---@field pid integer           agent process ID; must be the pane's foreground process

---The working tree the session works in.
---@class TransferWorkspace
---@field kind "git"|"plain"
---@field root string           repository root, or the session cwd for "plain"
---@field prefix string         cwd relative to root, "" or "sub/dir/"
---@field head string?          git: HEAD commit
---@field branch string?        git: branch name, nil when detached
---@field origin string?        git: origin URL
---@field common_dir string?    git: absolute common dir when root is a linked worktree

---Everything decided before anything changes. Stored in the journal; never recomputed on resume.
---@class TransferPlan
---@field version integer
---@field transfer_id string
---@field created_at string
---@field source TransferHost
---@field target TransferHost
---@field session AgentSession
---@field workspace TransferWorkspace
---@field target_root string
---@field target_cwd string
---@field target_common_dir string?   git: where the target's shared repository would be
---@field target_transcript string    where the transcript copy lands on the target
---@field ref string                  git ref naming this transfer's snapshot on both sides
---@field session_label string        label for the Rex session on the target
---@field keep_source boolean
---@field note string                 what the resumed agent is told about the move
---@field warnings string[]

---One unit of work. `done` probes the world so a rerun resumes; `run` returns the step's output.
---@class TransferStep
---@field name string
---@field title string
---@field done fun(plan: TransferPlan, out: table<string, table>): boolean
---@field run fun(plan: TransferPlan, out: table<string, table>): table?

---@class TransferJournal
---@field version integer
---@field status "running"|"failed"|"done"
---@field plan TransferPlan
---@field steps table<string, { status: string, at: string, error: string? }>
---@field outputs table<string, table>

return {}
