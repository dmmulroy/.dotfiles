#!/bin/bash
# Intent Layer freshness check for jj
# Runs before jj git push to warn about stale AGENTS.md files

# Get changed files compared to what's on the remote
# Use jj to find files changed in commits that would be pushed
CHANGED=$(jj log -r 'mine() ~ remote_bookmarks()' --no-graph -T '' --stat 2>/dev/null | grep '^ ' | awk '{print $1}' | sort -u)
[ -z "$CHANGED" ] && exit 0

STALE=""
while IFS= read -r file; do
  [[ "$file" == *AGENTS.md ]] && continue
  [[ -z "$file" ]] && continue
  dir=$(dirname "$file")
  while [ "$dir" != "." ]; do
    if [ -f "$dir/AGENTS.md" ]; then
      if ! echo "$CHANGED" | grep -qx "$dir/AGENTS.md"; then
        STALE="$STALE$dir\n"
      fi
      break
    fi
    dir=$(dirname "$dir")
  done
done <<< "$CHANGED"

STALE=$(echo -e "$STALE" | sort -u | grep .)
[ -z "$STALE" ] && exit 0

echo ""
echo "Intent nodes may need refresh:"
echo -e "$STALE" | while read -r dir; do echo "   $dir/AGENTS.md"; done
echo ""
echo "Run: /intent-sync"
echo ""
read -p "Push anyway? [y/N] " -r
[[ $REPLY =~ ^[Yy]$ ]] && exit 0
exit 1
