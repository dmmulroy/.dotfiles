#!/bin/bash
set -e

if [ -z "$1" ] || [ -z "$2" ] || [ -z "$3" ]; then
  echo "Usage: $0 <prd.json> <progress.txt> <iterations>"
  exit 1
fi

prd="$1"
progress="$2"
iterations="$3"

if [ ! -f "$prd" ]; then
  echo "Error: PRD file '$prd' not found"
  exit 1
fi

# Extract branchName from PRD
branch=$(jq -r '.branchName' "$prd")
if [ -z "$branch" ] || [ "$branch" = "null" ]; then
  echo "Error: PRD missing branchName field"
  exit 1
fi

# Detect VCS
if [ -d ".jj" ]; then
  vcs="jj"
  log_cmd="jj log --limit 10"
  branch_setup="jj new -m 'ralph: $branch'"
  commit_cmd="jj describe -m 'feat(<scope>): <description>' && jj new"
else
  vcs="git"
  log_cmd="git log --oneline -10"
  branch_setup="git checkout -b $branch 2>/dev/null || git checkout $branch"
  commit_cmd="git add -A && git commit -m 'feat(<scope>): <description>'"
fi

# Initialize progress file with Codebase Patterns template
if [ ! -f "$progress" ]; then
  cat > "$progress" << EOF
# Ralph Progress Log
Branch: $branch
Started: $(date +%Y-%m-%d)

## Codebase Patterns
<!-- READ THIS FIRST - Consolidate reusable patterns here -->

---
<!-- Iteration logs below - APPEND ONLY -->
EOF
  echo "Created progress file: $progress"
fi

echo "[ralph] starting - branch=$branch, vcs=$vcs, max=$iterations iterations"

for ((i=1; i<=$iterations; i++)); do
  echo "[ralph] iteration $i/$iterations"
  
  result=$(OPENCODE_PERMISSION='{"*":"allow"}' opencode run \
    "ENTROPY REMINDER: No shortcuts, no hacks. Patterns you establish will be copied. \
    Leave the codebase better than you found it. \
    \
    PRIORITY ORDER (highest to lowest): \
    architecture/core abstractions > integration points > spikes/unknowns > standard features > polish/cleanup. \
    Fail fast on risky work. Save easy wins for last. \
    \
    You are Ralph, iteration $i/$iterations. VCS: $vcs \
    \
    FILES: \
    - PRD: $prd \
    - Progress: $progress \
    \
    1. Read progress file ($progress) - CHECK 'Codebase Patterns' SECTION FIRST. \
    2. Read PRD ($prd) - find next feature with passes: false. \
    3. Check history: $log_cmd \
    4. Branch setup: $branch_setup \
    5. Implement the feature. \
    6. Check feedback loops: typechecking, linting, formatting, and tests if the project contains them. \
    7. Update the task's 'passes' field to true in the PRD ($prd). \
    8. Append to progress file ($progress): \
       ## Iteration $i - [feature.id] \
       - What was implemented \
       - Files changed \
       - **Learnings:** patterns, gotchas \
       If you discover a REUSABLE pattern, also add to '## Codebase Patterns' at TOP. \
    9. Commit: $commit_cmd \
    \
    ONLY WORK ON A SINGLE FEATURE. \
    If all features have passes: true, output <promise>COMPLETE</promise>." 2>&1 | tee /dev/tty)

  echo "$result"

  if [[ "$result" == *"<promise>COMPLETE</promise>"* ]]; then
    echo "[ralph] complete after $i iterations"
    exit 0
  fi
done

echo "[ralph] max iterations ($iterations) reached"
