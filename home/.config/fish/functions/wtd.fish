# Fetch a remote branch and create a detached worktree for reviewing it.
function wtd -d "Create a detached worktree for a remote branch" -a branch directory
  if test -z "$branch"
    echo "Usage: "(status -u)" branch [directory]"
    return 1
  end

  if test -z "$directory"
    set directory (string replace -a / - -- "$branch")
  end

  set -l worktree_dir (__wt.dir)
  or return 1

  git fetch origin "$branch"
  and git worktree add --detach "$worktree_dir/$directory" "origin/$branch"
end
