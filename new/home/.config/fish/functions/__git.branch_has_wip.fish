function __git.branch_has_wip -d "Returns 0 if branch has --wip--, otherwise 1"
  git log -n 1 2>/dev/null | grep -qc "\-\-wip\-\-"
end
