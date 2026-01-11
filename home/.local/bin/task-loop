#!/usr/bin/env bash
set -euo pipefail

# task-loop: Run complete-next-task in loop until PRD complete
# Usage: task-loop <feature> [--max-iterations=N]

MAX_ITERATIONS=25

# Parse args
while [[ $# -gt 0 ]]; do
    case $1 in
        --max-iterations=*)
            MAX_ITERATIONS="${1#*=}"
            shift
            ;;
        --max-iterations)
            MAX_ITERATIONS="$2"
            shift 2
            ;;
        -*)
            echo "Unknown option: $1" >&2
            exit 1
            ;;
        *)
            FEATURE="$1"
            shift
            ;;
    esac
done

if [[ -z "${FEATURE:-}" ]]; then
    echo "Usage: task-loop <feature> [--max-iterations=N]"
    exit 1
fi

COMPLETE_MARKER="<tasks>COMPLETE</tasks>"

for ((i=1; i<=MAX_ITERATIONS; i++)); do
    echo "=== Iteration $i/$MAX_ITERATIONS ==="

    # Stream output and check for completion marker
    found=false
    while IFS= read -r line; do
        printf '%s\n' "$line"
        [[ "$line" == *"$COMPLETE_MARKER"* ]] && found=true
    done < <(opencode run --command complete-next-task "$FEATURE" 2>&1)

    if $found; then
        echo "PRD complete, exiting."
        exit 0
    fi
done

echo "Max iterations ($MAX_ITERATIONS) reached."
exit 1
