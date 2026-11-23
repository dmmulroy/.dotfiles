-- Workspace port for git repositories. Moves the working tree as a snapshot
-- commit: HEAD plus every uncommitted and untracked (not ignored) change, pushed
-- straight to the target over ssh and restored there as uncommitted changes.
--
-- Guarantees:
--   * The source is never modified beyond new git objects and one ref
--     (refs/pi-transfer/<id>): the snapshot is built in a temporary index.
--   * The target is never clobbered: a dirty or diverged target is refused.
-- Not carried over: ignored files (.env, node_modules), stashes, and which
-- changes were staged (everything arrives unstaged).

local shell = require("shell")

local M = {}

M.KIND = "git"

-- sh: prints the tree of the working tree as it is now, using a temporary index
-- so the real index and the working tree are untouched. Run from the repo root.
local WORKTREE_TREE_FUNCTION = [[
worktree_tree() {
  wt_tmp=$(mktemp)
  wt_idx=$(git rev-parse --git-path index)
  if [ -f "$wt_idx" ]; then cp "$wt_idx" "$wt_tmp"; else rm -f "$wt_tmp"; fi
  GIT_INDEX_FILE="$wt_tmp" git add -A >/dev/null
  GIT_INDEX_FILE="$wt_tmp" git write-tree
  rm -f "$wt_tmp"
}
]]

---The git workspace containing `cwd` on the source, or nil when `cwd` isn't in a repository.
---@param transport table
---@param source TransferHost
---@param cwd string
---@return TransferWorkspace?
function M.inspect_source(transport, source, cwd)
	local out = transport.must_run_script(
		source,
		shell.script({ CWD = cwd }, { "CWD" }, [[
cd "$CWD"
command -v git >/dev/null 2>&1 || exit 0
root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
echo "root=$root"
echo "prefix=$(git rev-parse --show-prefix)"
echo "head=$(git rev-parse -q --verify HEAD || true)"
echo "branch=$(git symbolic-ref -q --short HEAD || true)"
echo "origin=$(git config --get remote.origin.url || true)"
git_dir=$(git rev-parse --path-format=absolute --git-dir)
common_dir=$(git rev-parse --path-format=absolute --git-common-dir)
if [ "$git_dir" != "$common_dir" ]; then echo "common_dir=$common_dir"; fi
]]),
		"inspecting the repository"
	)
	local info = shell.parse_key_values(out)
	if not info.root then
		return nil
	end
	local function optional(value)
		return value ~= "" and value or nil
	end
	return {
		kind = M.KIND,
		root = info.root,
		prefix = info.prefix or "",
		head = optional(info.head),
		branch = optional(info.branch),
		origin = optional(info.origin),
		common_dir = optional(info.common_dir),
	}
end

---Reasons the target can't take this workspace. Empty means it can. Reads only.
---@param transport table
---@param plan TransferPlan
---@return string[] problems
function M.check_target(transport, plan)
	local ws = plan.workspace
	if not ws.head then
		return { "the repository at " .. ws.root .. " has no commits yet" }
	end

	local out = transport.must_run_script(
		plan.target,
		shell.script(
			{ ROOT = plan.target_root, BRANCH = ws.branch, COMMON = plan.target_common_dir },
			{ "ROOT", "BRANCH", "COMMON" },
			[[
command -v git >/dev/null 2>&1 || { echo "has_git=0"; exit 0; }
echo "has_git=1"
tip_of() { git "$@" rev-parse -q --verify "refs/heads/$BRANCH" || true; }
if [ -e "$ROOT" ]; then
  echo "exists=1"
  real=$(cd "$ROOT" && pwd -P)
  top=$(git -C "$ROOT" rev-parse --show-toplevel 2>/dev/null || true)
  if [ -n "$top" ] && [ "$top" = "$real" ]; then
    echo "is_repo=1"
    echo "dirty=$(git -C "$ROOT" status --porcelain | wc -l | tr -d ' ')"
    if [ -n "$BRANCH" ]; then echo "branch_tip=$(tip_of -C "$ROOT")"; fi
  else
    echo "is_repo=0"
    echo "inside_repo=$top"
    echo "entries=$(ls -A "$ROOT" | wc -l | tr -d ' ')"
  fi
else
  echo "exists=0"
  if [ -n "$COMMON" ] && git --git-dir="$COMMON" rev-parse --git-dir >/dev/null 2>&1; then
    echo "has_common=1"
    if [ -n "$BRANCH" ]; then echo "branch_tip=$(tip_of --git-dir="$COMMON")"; fi
  fi
fi
]]
		),
		"inspecting the target directory"
	)
	local info = shell.parse_key_values(out)
	local where = plan.target.label .. ":" .. plan.target_root
	local problems = {}

	if info.has_git ~= "1" then
		return { "git is not installed on " .. plan.target.label }
	end
	if info.exists == "1" and info.is_repo ~= "1" then
		if (info.inside_repo or "") ~= "" then
			table.insert(problems, where .. " is inside another repository (" .. info.inside_repo .. ")")
		elseif info.entries ~= "0" then
			table.insert(problems, where .. " exists and is not a git repository")
		end
	end
	if info.is_repo == "1" and info.dirty ~= "0" then
		table.insert(problems, where .. " has uncommitted changes; commit or stash them there first")
	end

	local tip = info.branch_tip
	if tip and tip ~= "" then
		-- The target's branch must be an ancestor of ours, so moving it forward loses nothing.
		-- If the source doesn't have the commit at all, the target has work we lack.
		local check = transport.run_script(
			plan.source,
			shell.script({ ROOT = ws.root, TIP = tip, HEAD = ws.head }, { "ROOT", "TIP", "HEAD" }, [[
cd "$ROOT"
git merge-base --is-ancestor "$TIP" "$HEAD"
]])
		)
		if not check.ok then
			table.insert(
				problems,
				"branch " .. ws.branch .. " on " .. plan.target.label .. " has commits this machine doesn't; pull them here first"
			)
		end
	end
	return problems
end

---Whether a snapshot still matches the source's working tree.
---@param transport table
---@param plan TransferPlan
---@param snapshot table?  a previous `snapshot` result
---@return boolean
function M.is_snapshot_current(transport, plan, snapshot)
	if not snapshot or not snapshot.commit then
		return false
	end
	local result = transport.run_script(
		plan.source,
		shell.script(
			{ ROOT = plan.workspace.root, REF = plan.ref, COMMIT = snapshot.commit, TREE = snapshot.tree, HEAD = plan.workspace.head },
			{ "ROOT", "REF", "COMMIT", "TREE", "HEAD" },
			WORKTREE_TREE_FUNCTION .. [[
cd "$ROOT"
[ "$(git rev-parse -q --verify "$REF" || true)" = "$COMMIT" ] || exit 1
[ "$(git rev-parse -q --verify HEAD || true)" = "$HEAD" ] || exit 1
[ "$(worktree_tree)" = "$TREE" ]
]]
		)
	)
	return result.ok
end

---Freezes the source's working tree into a commit on plan.ref.
---@param transport table
---@param plan TransferPlan
---@return { commit: string, tree: string }
function M.snapshot(transport, plan)
	local out = transport.must_run_script(
		plan.source,
		shell.script(
			{ ROOT = plan.workspace.root, REF = plan.ref, ID = plan.transfer_id, HEAD = plan.workspace.head },
			{ "ROOT", "REF", "ID", "HEAD" },
			WORKTREE_TREE_FUNCTION .. [[
cd "$ROOT"
now=$(git rev-parse -q --verify HEAD || true)
if [ "$now" != "$HEAD" ]; then
  echo "HEAD moved from $HEAD to $now since the transfer was planned; run it again with fresh=true" >&2
  exit 1
fi
tree=$(worktree_tree)
commit=$(git -c user.name=pi-transfer -c user.email=pi-transfer@localhost \
  commit-tree --no-gpg-sign "$tree" -p "$HEAD" -m "pi-transfer $ID")
git update-ref "$REF" "$commit"
echo "tree=$tree"
echo "commit=$commit"
]]
		),
		"snapshotting the working tree",
		{ timeout = 300 }
	)
	local info = shell.parse_key_values(out)
	if not info.commit or not info.tree then
		error("snapshotting the working tree printed no commit", 0)
	end
	return { commit = info.commit, tree = info.tree }
end

-- sh: sets target_repo to the target's repository: the root when it is (or can
-- become) a repository, or the shared repository a new worktree will hang off.
local TARGET_REPOSITORY = [[
if [ ! -e "$ROOT" ] && [ -n "$COMMON" ] && git --git-dir="$COMMON" rev-parse --git-dir >/dev/null 2>&1; then
  target_repo="$COMMON"
else
  target_repo="$ROOT"
fi
]]

---@return boolean
function M.is_shipped(transport, plan, snapshot)
	local result = transport.run_script(
		plan.target,
		shell.script(
			{ ROOT = plan.target_root, COMMON = plan.target_common_dir, REF = plan.ref, COMMIT = snapshot.commit },
			{ "ROOT", "COMMON", "REF", "COMMIT" },
			TARGET_REPOSITORY .. [[
[ -e "$target_repo" ] || exit 1
cd "$target_repo"
[ "$(git rev-parse -q --verify "$REF" || true)" = "$COMMIT" ]
]]
		)
	)
	return result.ok
end

---Pushes the snapshot (and the history it needs) to the target's repository,
---creating that repository when the directory is new.
function M.ship(transport, plan, snapshot)
	local out = transport.must_run_script(
		plan.target,
		shell.script(
			{ ROOT = plan.target_root, COMMON = plan.target_common_dir, ORIGIN = plan.workspace.origin },
			{ "ROOT", "COMMON", "ORIGIN" },
			TARGET_REPOSITORY .. [[
if [ "$target_repo" = "$ROOT" ] && [ ! -e "$ROOT/.git" ]; then
  mkdir -p "$ROOT"
  git init -q "$ROOT"
  if [ -n "$ORIGIN" ]; then git -C "$ROOT" remote add origin "$ORIGIN"; fi
fi
echo "target_repo=$target_repo"
]]
		),
		"preparing the target repository"
	)
	local target_repo = shell.parse_key_values(out).target_repo
	if not target_repo then
		error("preparing the target repository printed no path", 0)
	end

	transport.must_run_script(
		plan.source,
		shell.script(
			{
				ROOT = plan.workspace.root,
				URL = transport.git_url(plan.target, target_repo),
				REF = plan.ref,
				SSH = transport.git_ssh_command(),
			},
			{ "ROOT", "URL", "REF", "SSH" },
			[[
cd "$ROOT"
GIT_SSH_COMMAND="$SSH" git push --quiet --force "$URL" "$REF:$REF"
]]
		),
		"pushing the snapshot",
		{ timeout = 900 }
	)
end

---Whether the target's working tree already equals the snapshot, on top of the source's HEAD.
---@return boolean
function M.is_restored(transport, plan, snapshot)
	local result = transport.run_script(
		plan.target,
		shell.script(
			{ ROOT = plan.target_root, HEAD = plan.workspace.head, TREE = snapshot.tree, BRANCH = plan.workspace.branch },
			{ "ROOT", "HEAD", "TREE", "BRANCH" },
			WORKTREE_TREE_FUNCTION .. [[
[ -e "$ROOT/.git" ] || exit 1
cd "$ROOT"
[ "$(git rev-parse -q --verify HEAD || true)" = "$HEAD" ] || exit 1
[ "$(git symbolic-ref -q --short HEAD || true)" = "$BRANCH" ] || exit 1
[ "$(worktree_tree)" = "$TREE" ]
]]
		)
	)
	return result.ok
end

---Checks out the source's branch at its HEAD on the target, with the snapshot's
---changes on top as uncommitted changes.
function M.restore(transport, plan, snapshot)
	transport.must_run_script(
		plan.target,
		shell.script(
			{
				ROOT = plan.target_root,
				COMMON = plan.target_common_dir,
				HEAD = plan.workspace.head,
				BRANCH = plan.workspace.branch,
				SNAP = snapshot.commit,
			},
			{ "ROOT", "COMMON", "HEAD", "BRANCH", "SNAP" },
			[[
if [ ! -e "$ROOT" ]; then
  git --git-dir="$COMMON" worktree add --quiet --detach "$ROOT" "$HEAD"
fi
cd "$ROOT"
# Checked when the transfer was planned; checked again because time has passed.
if [ -n "$(git status --porcelain)" ]; then
  echo "$ROOT has uncommitted changes that appeared after the transfer was planned" >&2
  exit 1
fi
if [ -n "$BRANCH" ]; then
  tip=$(git rev-parse -q --verify "refs/heads/$BRANCH" || true)
  if [ -n "$tip" ] && [ "$tip" != "$SNAP" ] && ! git merge-base --is-ancestor "$tip" "$HEAD"; then
    echo "branch $BRANCH has commits here that the source doesn't" >&2
    exit 1
  fi
  git checkout --quiet -B "$BRANCH" "$SNAP"
else
  git checkout --quiet --detach "$SNAP"
fi
# Working tree = snapshot; now put the branch and index back on the real HEAD,
# which leaves the snapshot's changes uncommitted.
git reset --quiet --mixed "$HEAD"
]]
		),
		"restoring the working tree",
		{ timeout = 300 }
	)
end

---Removes the snapshot ref from both repositories. The objects are left for git gc.
function M.cleanup(transport, plan)
	transport.run_script(
		plan.source,
		shell.script({ ROOT = plan.workspace.root, REF = plan.ref }, { "ROOT", "REF" }, [[
cd "$ROOT"
git update-ref -d "$REF"
]])
	)
	transport.run_script(
		plan.target,
		shell.script({ ROOT = plan.target_root, REF = plan.ref }, { "ROOT", "REF" }, [[
cd "$ROOT"
git update-ref -d "$REF"
]])
	)
end

return M
