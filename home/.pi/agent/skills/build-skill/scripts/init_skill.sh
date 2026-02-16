#!/usr/bin/env bash
#
# init_skill.sh - Scaffold a new skill directory
#
# Usage: init_skill.sh <skill-name> <output-dir> [--type TYPE] [--minimal]
#
# Types: minimal, standard, reference-heavy, script-heavy

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
Usage: init_skill.sh <skill-name> <output-dir> [options]

Options:
  --type TYPE    Template type (minimal, standard, reference-heavy, script-heavy)
  --minimal      Shorthand for --type minimal

Types:
  minimal        SKILL.md only
  standard       SKILL.md + references/ (default)
  reference-heavy  SKILL.md + references/ with multiple files
  script-heavy   SKILL.md + scripts/

Examples:
  init_skill.sh my-skill ./skills
  init_skill.sh my-skill ./skills --type reference-heavy
  init_skill.sh my-skill ./skills --minimal
EOF
    exit 1
}

# Validate skill name format
validate_name() {
    local name="$1"
    if [[ ! "$name" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
        echo -e "${RED}Error${NC}: Invalid skill name '$name'" >&2
        echo "Name must be lowercase alphanumeric with single hyphens" >&2
        echo "Valid examples: my-skill, pdf-processor, code-review" >&2
        exit 1
    fi
    if [[ ${#name} -gt 64 ]]; then
        echo -e "${RED}Error${NC}: Skill name too long (${#name} chars, max 64)" >&2
        exit 1
    fi
}

# Convert skill-name to Title Case
title_case() {
    echo "$1" | sed 's/-/ /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) substr($i,2)}1'
}

# Parse arguments
SKILL_NAME=""
OUTPUT_DIR=""
TEMPLATE_TYPE="standard"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --type)
            TEMPLATE_TYPE="$2"
            shift 2
            ;;
        --minimal)
            TEMPLATE_TYPE="minimal"
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
            if [[ -z "$SKILL_NAME" ]]; then
                SKILL_NAME="$1"
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

# Validate required args
if [[ -z "$SKILL_NAME" ]] || [[ -z "$OUTPUT_DIR" ]]; then
    usage
fi

# Validate template type
case "$TEMPLATE_TYPE" in
    minimal|standard|reference-heavy|script-heavy) ;;
    *)
        echo -e "${RED}Error${NC}: Unknown template type '$TEMPLATE_TYPE'" >&2
        echo "Valid types: minimal, standard, reference-heavy, script-heavy" >&2
        exit 1
        ;;
esac

# Validate skill name
validate_name "$SKILL_NAME"

# Create output directory if needed
mkdir -p "$OUTPUT_DIR"

# Full skill path
SKILL_DIR="$OUTPUT_DIR/$SKILL_NAME"

# Check if already exists
if [[ -d "$SKILL_DIR" ]]; then
    echo -e "${RED}Error${NC}: Directory already exists: $SKILL_DIR" >&2
    exit 1
fi

SKILL_TITLE="$(title_case "$SKILL_NAME")"

echo -e "${GREEN}Creating skill:${NC} $SKILL_NAME"
echo "  Location: $SKILL_DIR"
echo "  Template: $TEMPLATE_TYPE"
echo ""

# Create skill directory
mkdir -p "$SKILL_DIR"

# Generate SKILL.md content based on template type
generate_skill_md() {
    cat << EOF
---
name: $SKILL_NAME
description: TODO: What this skill does and when to use it. Include specific triggers like 'Use when...' or 'Use for...'
---

# $SKILL_TITLE

TODO: Brief overview (1-2 sentences).

## Quick Start

TODO: Minimal example to get started.

EOF

    case "$TEMPLATE_TYPE" in
        minimal)
            cat << 'EOF'
## Usage

TODO: Main instructions here.

## Examples

TODO: Concrete examples.
EOF
            ;;
        standard|reference-heavy)
            cat << 'EOF'
## In This Reference

| File | Purpose |
|------|---------|
| [reference.md](./references/reference.md) | TODO: Describe |

## Usage

TODO: Main instructions. Link to references as needed.
EOF
            ;;
        script-heavy)
            cat << 'EOF'
## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/example.sh` | TODO: Describe |

## Usage

TODO: Main instructions. Reference scripts for automation.

### Running Scripts

```bash
./scripts/example.sh <args>
```
EOF
            ;;
    esac
}

# Write SKILL.md
generate_skill_md > "$SKILL_DIR/SKILL.md"
echo -e "  ${GREEN}Created${NC} SKILL.md"

# Create additional directories based on template
case "$TEMPLATE_TYPE" in
    standard)
        mkdir -p "$SKILL_DIR/references"
        cat << 'EOF' > "$SKILL_DIR/references/reference.md"
# Reference

TODO: Detailed reference content.

## Contents

- Section 1
- Section 2

## Section 1

TODO: Content.

## Section 2

TODO: Content.
EOF
        echo -e "  ${GREEN}Created${NC} references/reference.md"
        ;;
        
    reference-heavy)
        mkdir -p "$SKILL_DIR/references"
        
        cat << 'EOF' > "$SKILL_DIR/references/api.md"
# API Reference

TODO: API documentation.

## Contents

- Authentication
- Endpoints
- Error Handling

## Authentication

TODO: Auth details.

## Endpoints

TODO: Endpoint docs.

## Error Handling

TODO: Error codes.
EOF
        echo -e "  ${GREEN}Created${NC} references/api.md"
        
        cat << 'EOF' > "$SKILL_DIR/references/patterns.md"
# Patterns

TODO: Best practices and patterns.

## Contents

- Pattern 1
- Pattern 2

## Pattern 1

TODO: Describe pattern.

## Pattern 2

TODO: Describe pattern.
EOF
        echo -e "  ${GREEN}Created${NC} references/patterns.md"
        
        cat << 'EOF' > "$SKILL_DIR/references/gotchas.md"
# Gotchas

Common issues and how to fix them.

## Contents

- Issue 1
- Issue 2

## Issue 1

**Problem:** TODO
**Fix:** TODO

## Issue 2

**Problem:** TODO
**Fix:** TODO
EOF
        echo -e "  ${GREEN}Created${NC} references/gotchas.md"
        ;;
        
    script-heavy)
        mkdir -p "$SKILL_DIR/scripts"
        cat << 'EOF' > "$SKILL_DIR/scripts/example.sh"
#!/usr/bin/env bash
#
# example.sh - TODO: Description
#
# Usage: example.sh <args>

set -euo pipefail

if [[ $# -lt 1 ]]; then
    echo "Usage: example.sh <args>" >&2
    exit 1
fi

echo "TODO: Implement script"
EOF
        chmod +x "$SKILL_DIR/scripts/example.sh"
        echo -e "  ${GREEN}Created${NC} scripts/example.sh"
        ;;
esac

echo ""
echo -e "${GREEN}Success!${NC} Skill created at $SKILL_DIR"
echo ""
echo "Next steps:"
echo "  1. Edit SKILL.md - fill in TODO sections"
echo "  2. Update description with specific activation triggers"
if [[ "$TEMPLATE_TYPE" != "minimal" ]]; then
    echo "  3. Customize or remove template files"
fi
echo "  4. Validate: ./scripts/validate_skill.sh $SKILL_DIR"
