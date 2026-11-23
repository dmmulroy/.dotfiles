-- Workspace port for directories that aren't in a git repository: the whole
-- directory is copied with rsync. Same interface as git_workspace.lua.
-- The target directory must be new or empty, so nothing there can be overwritten.

local shell = require("shell")

local M = {}

M.KIND = "plain"

-- A directory without git has no ignore rules, so this guards against copying
-- something like a home directory by accident.
local MAX_PLAIN_WORKSPACE_KILOBYTES = 1024 * 1024

---@param cwd string
---@return TransferWorkspace
function M.inspect_source(_, _, cwd)
	return { kind = M.KIND, root = cwd, prefix = "" }
end

---@return string[] problems
function M.check_target(transport, plan)
	local problems = {}
	local source_out = transport.must_run_script(
		plan.source,
		shell.script({ ROOT = plan.workspace.root }, { "ROOT" }, [[
command -v rsync >/dev/null 2>&1 && echo "has_rsync=1"
echo "kilobytes=$(du -sk "$ROOT" | cut -f1)"
]]),
		"measuring the directory"
	)
	local source_info = shell.parse_key_values(source_out)
	if source_info.has_rsync ~= "1" then
		table.insert(problems, "rsync is not installed on this machine")
	end
	if (tonumber(source_info.kilobytes) or 0) > MAX_PLAIN_WORKSPACE_KILOBYTES then
		table.insert(
			problems,
			plan.workspace.root .. " is not a git repository and is larger than 1 GiB; refusing to copy it whole"
		)
	end

	local target_out = transport.must_run_script(
		plan.target,
		shell.script({ ROOT = plan.target_root }, { "ROOT" }, [[
command -v rsync >/dev/null 2>&1 && echo "has_rsync=1"
if [ -e "$ROOT" ]; then echo "entries=$(ls -A "$ROOT" | wc -l | tr -d ' ')"; else echo "entries=0"; fi
]]),
		"inspecting the target directory"
	)
	local target_info = shell.parse_key_values(target_out)
	if target_info.has_rsync ~= "1" then
		table.insert(problems, "rsync is not installed on " .. plan.target.label)
	end
	if target_info.entries ~= "0" then
		table.insert(problems, plan.target.label .. ":" .. plan.target_root .. " already exists and is not empty")
	end
	return problems
end

-- There is nothing to freeze: the directory is copied as it is when shipped.
function M.is_snapshot_current(_, _, snapshot)
	return snapshot ~= nil
end

function M.snapshot()
	return { kind = M.KIND }
end

local function rsync(transport, plan, extra_flags)
	local remote_shell, destination = transport.rsync_destination(plan.target, plan.target_root .. "/")
	return transport.run_script(
		plan.source,
		shell.script(
			{ ROOT = plan.workspace.root, DEST = destination, RSH = remote_shell, FLAGS = extra_flags },
			{ "ROOT", "DEST", "RSH", "FLAGS" },
			[[
if [ -n "$RSH" ]; then
  rsync -a --delete $FLAGS -e "$RSH" "$ROOT/" "$DEST"
else
  rsync -a --delete $FLAGS "$ROOT/" "$DEST"
fi
]]
		),
		{ timeout = 900 }
	)
end

---Shipped when a dry run finds nothing left to copy.
function M.is_shipped(transport, plan)
	local exists = transport.run_script(
		plan.target,
		shell.script({ ROOT = plan.target_root }, { "ROOT" }, [[
[ -d "$ROOT" ]
]])
	)
	if not exists.ok then
		return false
	end
	local result = rsync(transport, plan, "-n -i")
	return result.ok and shell.trim(result.stdout) == ""
end

function M.ship(transport, plan)
	transport.must_run_script(
		plan.target,
		shell.script({ ROOT = plan.target_root }, { "ROOT" }, [[
mkdir -p "$ROOT"
]]),
		"creating the target directory"
	)
	local result = rsync(transport, plan, "")
	if not result.ok then
		error("copying " .. plan.workspace.root .. " failed: " .. shell.trim(result.stderr), 0)
	end
end

-- Shipping already put the files in place.
function M.is_restored(transport, plan)
	return M.is_shipped(transport, plan)
end

function M.restore() end

function M.cleanup() end

return M
