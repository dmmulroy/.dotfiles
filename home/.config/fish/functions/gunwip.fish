# Work In Progress (wip)
# These features allow to pause a branch development and switch to another one
# When you want to go back to work, just unwip it
#
function gunwip -d "git uncommit the work-in-progress branch"
  git log -n 1 | grep -q -c "\--wip--"; and git reset HEAD~1
end
