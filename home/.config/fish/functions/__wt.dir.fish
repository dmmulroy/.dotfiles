# Return the configured worktree directory or infer it from the repository layout.
function __wt.dir -d "Resolve the worktree directory"
  if set -q WT_DIR; and test -n "$WT_DIR"
    path resolve "$WT_DIR"
    return
  end

  set -l common_dir (git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)
  or return 1

  # Bare-root layouts keep .bare and all worktrees in the same directory.
  if test (path basename "$common_dir") = .bare
    path dirname "$common_dir"
    return
  end

  set -l top_level (git rev-parse --show-toplevel 2>/dev/null)
  or return 1
  path dirname "$top_level"
end
