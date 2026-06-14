# Change into a worktree directory under WT_DIR.
function wtcd -d "Change into a worktree directory" -a directory
  if test -z "$directory"
    echo "Usage: "(status -u)" directory"
    return 1
  end

  set -l worktree_dir (__wt.dir)
  or return 1

  cd "$worktree_dir/$directory"
end
