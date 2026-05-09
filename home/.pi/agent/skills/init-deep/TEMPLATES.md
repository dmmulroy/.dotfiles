# AGENTS.md Templates

## Root AGENTS.md (Full Treatment)

```markdown
# PROJECT NAME

**Generated:** {YYYY-MM-DDTHH:MM:SSZ}
**Commit:** {SHORT_SHA}

{1–2 sentences: what this is + core stack}

## STRUCTURE

\```
{root}/
├── {dir}/    # {non-obvious purpose only}
└── {entry}
\```

## WHERE TO LOOK

| Task | Location |
|------|----------|

## CONVENTIONS

{ONLY deviations from standard — skip anything a competent dev would assume}

## ANTI-PATTERNS

{Explicitly forbidden in THIS project}

## COMMANDS

\```bash
{dev/test/build — only non-obvious ones}
\```

## KEY CONFIGS

| Tool | Entry | Notes |
|------|-------|-------|

## UNIQUE STYLES

{Project-specific quirks worth knowing}

## NOTES

{Gotchas, traps, things that burned someone}
```

### Quality Gates (Root)

- 50–150 lines
- No generic advice ("use descriptive variable names")
- No obvious info ("src/ contains source code")
- Every item passes: "Would an experienced dev need to be told this?"

## Subdirectory AGENTS.md

```markdown
# {DIRECTORY PURPOSE}

**Generated:** {TIMESTAMP}
**Commit:** {SHORT_SHA}

{1 line: what this directory does}

## STRUCTURE

{Only if >5 subdirs — otherwise skip}

## WHERE TO LOOK

| Task | Location |
|------|----------|

## CONVENTIONS

{Only if DIFFERENT from parent — otherwise skip entire section}

## ANTI-PATTERNS

{Only if directory-specific — otherwise skip}
```

### Quality Gates (Subdirectory)

- 30–80 lines
- NEVER repeat parent content
- Skip sections that would be empty or redundant
- Must justify existence: "What does this tell you that the parent doesn't?"

## Section Guidelines

### STRUCTURE
- Only show directories that aren't self-explanatory
- Annotate with non-obvious purpose
- Use `(AGENTS.md)` suffix to indicate child has its own file

### WHERE TO LOOK
- Task-oriented: "I want to do X" → "look here"
- Most valuable section — spend effort here
- Include non-obvious locations (e.g., "Git hooks are in jj config, not .git/hooks")

### CONVENTIONS
- Only deviations from language/framework defaults
- "1 plugin per file" is worth noting; "use semicolons" is not (that's what the linter says)

### ANTI-PATTERNS
- Things someone WILL try that WILL break
- Each should have a brief reason or the correct alternative

### COMMANDS
- Only non-obvious commands
- Skip `npm install`, `cargo build` — include `dot stow`, `dot doctor`

### NOTES
- Gotchas that burned someone
- Order dependencies ("X must load before Y")
- Environment quirks
