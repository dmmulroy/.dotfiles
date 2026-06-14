# Remove a worktree and its checked-out branch unless --keep preserves the branch.
function wtr -d "Remove a worktree and its branch"
  argparse 'k/keep' -- $argv
  or return 1

  if test (count $argv) -ne 1
    echo "Usage: "(status -u)" [-k|--keep] directory"
    return 1
  end

  set -l worktree_dir (__wt.dir)
  or return 1

  set -l directory $argv[1]
  set -l worktree
  if string match -q '/*' -- "$directory"
    set worktree (path normalize "$directory")
  else
    set worktree (path normalize "$worktree_dir/$directory")
  end

  set -l branch (git -C "$worktree" symbolic-ref --quiet --short HEAD 2>/dev/null)

  git worktree remove "$worktree"
  or return 1

  if not set -q _flag_keep; and test -n "$branch"
    git branch -d "$branch"
  end
end
