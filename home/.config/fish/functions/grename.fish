function grename -d "Rename 'old' branch to 'new', including in origin remote" -a old new
  if test (count $argv) -ne 2
    echo "Usage: "(status -u)" old_branch new_branch"
    return 1
  end
  git branch -m $old $new
  git push origin :$old
  and git push --set-upstream origin $new
end

complete -c grename -x -a "(complete -C 'git branch ')"
