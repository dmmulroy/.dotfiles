# Create a worktree and matching branch from main, or an optional base branch.
function wt -d "Create a worktree and matching branch" -a branch base
  if test -z "$branch"
    echo "Usage: "(status -u)" branch [base]"
    return 1
  end

  if test -z "$base"
    set base main
  end

  set -l worktree_dir (__wt.dir)
  or return 1

  git worktree add -b "$branch" "$worktree_dir/$branch" "$base"
end
