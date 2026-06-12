# Put worktrees in a sibling directory unless WT_DIR is already configured.
if not set -q WT_DIR
  set -gx WT_DIR ..
end
