#!/usr/bin/env bash
#
# package_skill.sh - Package a skill into a distributable zip file
#
# Usage: package_skill.sh <skill-dir> [output-dir] [--dry-run]

set -euo pipefail

# Colors
if [[ -t 1 ]]; then
    GREEN='\033[0;32m'
    YELLOW='\033[0;33m'
    RED='\033[0;31m'
    NC='\033[0m'
else
    GREEN='' YELLOW='' RED='' NC=''
fi

usage() {
    cat << 'EOF'
Usage: package_skill.sh <skill-dir> [output-dir] [--dry-run]

Options:
  --dry-run    Preview what would be packaged without creating zip

Examples:
  package_skill.sh ./my-skill
  package_skill.sh ./my-skill ./dist
  package_skill.sh ./my-skill --dry-run
EOF
    exit 1
}

# Get script directory for relative paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Parse arguments
SKILL_DIR=""
OUTPUT_DIR=""
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        -h|--help)
            usage
            ;;
        -*)
            echo "Unknown option: $1" >&2
            usage
            ;;
        *)
            if [[ -z "$SKILL_DIR" ]]; then
                SKILL_DIR="$1"
            elif [[ -z "$OUTPUT_DIR" ]]; then
                OUTPUT_DIR="$1"
            else
                echo "Too many arguments" >&2
                usage
            fi
            shift
            ;;
    esac
done

if [[ -z "$SKILL_DIR" ]]; then
    usage
fi

# Resolve skill directory
if [[ ! -d "$SKILL_DIR" ]]; then
    echo -e "${RED}Error${NC}: Directory not found: $SKILL_DIR" >&2
    exit 1
fi

SKILL_DIR="$(cd "$SKILL_DIR" && pwd)"
SKILL_NAME="$(basename "$SKILL_DIR")"

# Default output directory is current directory
if [[ -z "$OUTPUT_DIR" ]]; then
    OUTPUT_DIR="$(pwd)"
else
    mkdir -p "$OUTPUT_DIR"
    OUTPUT_DIR="$(cd "$OUTPUT_DIR" && pwd)"
fi

ZIP_FILE="$OUTPUT_DIR/$SKILL_NAME.zip"

echo -e "${GREEN}Packaging skill:${NC} $SKILL_NAME"
echo "  Source: $SKILL_DIR"
echo "  Output: $ZIP_FILE"
echo ""

# Run validation first
echo "Running validation..."
VALIDATE_SCRIPT="$SCRIPT_DIR/validate_skill.sh"
if [[ -x "$VALIDATE_SCRIPT" ]]; then
    if ! "$VALIDATE_SCRIPT" "$SKILL_DIR"; then
        echo ""
        echo -e "${RED}Validation failed.${NC} Fix errors before packaging." >&2
        exit 1
    fi
else
    echo -e "${YELLOW}Warning${NC}: validate_skill.sh not found, skipping validation"
fi
echo ""

# Files/patterns to exclude
EXCLUDE_PATTERNS=(
    ".git"
    ".git/*"
    ".gitignore"
    ".DS_Store"
    "*.pyc"
    "__pycache__"
    ".env"
    ".env.*"
    "*.pem"
    "*.key"
    "id_rsa*"
    "credentials*"
    "secrets*"
    ".aws"
    ".ssh"
    "node_modules"
    "*.log"
)

# Build exclude args for zip
EXCLUDE_ARGS=()
for pattern in "${EXCLUDE_PATTERNS[@]}"; do
    EXCLUDE_ARGS+=("-x" "$pattern")
done

# Count files to be packaged
echo "Files to package:"
FILE_COUNT=0
TOTAL_SIZE=0
while IFS= read -r -d '' file; do
    rel_path="${file#$SKILL_DIR/}"
    
    # Check against exclude patterns
    skip=false
    for pattern in "${EXCLUDE_PATTERNS[@]}"; do
        if [[ "$rel_path" == $pattern ]] || [[ "$(basename "$rel_path")" == $pattern ]]; then
            skip=true
            break
        fi
    done
    
    if ! $skip; then
        file_size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null || echo 0)
        TOTAL_SIZE=$((TOTAL_SIZE + file_size))
        ((FILE_COUNT++)) || true
        echo "  $rel_path"
    fi
done < <(find "$SKILL_DIR" -type f -print0)

echo ""
echo "Total: $FILE_COUNT files"

# Convert size to human readable
if [[ $TOTAL_SIZE -gt 1048576 ]]; then
    SIZE_HR="$((TOTAL_SIZE / 1048576)) MB"
elif [[ $TOTAL_SIZE -gt 1024 ]]; then
    SIZE_HR="$((TOTAL_SIZE / 1024)) KB"
else
    SIZE_HR="$TOTAL_SIZE bytes"
fi
echo "Size: $SIZE_HR"

# Warn if large
if [[ $TOTAL_SIZE -gt 2097152 ]]; then
    echo -e "${YELLOW}Warning${NC}: Package exceeds 2MB. Consider reducing size."
fi

# Dry run stops here
if $DRY_RUN; then
    echo ""
    echo "(Dry run - no zip created)"
    exit 0
fi

echo ""

# Remove existing zip if present
if [[ -f "$ZIP_FILE" ]]; then
    rm "$ZIP_FILE"
fi

# Create zip from parent directory to include skill folder name
PARENT_DIR="$(dirname "$SKILL_DIR")"
cd "$PARENT_DIR"

# Create zip
zip -r "$ZIP_FILE" "$SKILL_NAME" "${EXCLUDE_ARGS[@]}" -x "*.git*" > /dev/null

echo -e "${GREEN}Success!${NC} Created $ZIP_FILE"
echo ""
echo "To install, extract to:"
echo "  Project: .opencode/skills/"
echo "  Global:  ~/.config/opencode/skills/"
