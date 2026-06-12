# Fetch a remote branch and create a detached worktree for reviewing it.
function wtd -d "Create a detached worktree for a remote branch" -a branch directory
  if test -z "$branch"
    echo "Usage: "(status -u)" branch [directory]"
    return 1
  end

  if test -z "$directory"
    set directory (string replace -a / - -- "$branch")
  end

  git fetch origin "$branch"
  and git worktree add --detach "$WT_DIR/$directory" "origin/$branch"
end
