# Change into a worktree directory under WT_DIR.
function wtcd -d "Change into a worktree directory" -a directory
  if test -z "$directory"
    echo "Usage: "(status -u)" directory"
    return 1
  end

  cd "$WT_DIR/$directory"
end
