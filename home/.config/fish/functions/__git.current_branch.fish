function __git.current_branch -d "Output git's current branch name"
  begin
    git symbolic-ref HEAD; or \
    git rev-parse --short HEAD; or return
  end 2>/dev/null | sed -e 's|^refs/heads/||'
end
