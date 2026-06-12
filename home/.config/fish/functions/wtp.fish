# Prune stale worktree metadata left by manually deleted directories.
function wtp -d "Prune stale Git worktree metadata"
  git worktree prune -v
end
