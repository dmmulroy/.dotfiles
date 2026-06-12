# Remove a worktree and delete its matching branch unless -k keeps the branch.
function wtrm -d "Remove a worktree and its matching branch" -a branch keep
  if test -z "$branch"
    echo "Usage: "(status -u)" branch [-k]"
    return 1
  end

  git worktree remove "$WT_DIR/$branch"
  or return 1

  if test "$keep" != "-k"
    git branch -d "$branch" 2>/dev/null
  end
end
