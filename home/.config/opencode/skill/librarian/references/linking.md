# GitHub Linking Patterns

All file/dir/code refs → fluent markdown links. Never raw URLs.

## URL Formats

### File
```
https://github.com/{owner}/{repo}/blob/{ref}/{path}
```

### File + Lines
```
https://github.com/{owner}/{repo}/blob/{ref}/{path}#L{start}-L{end}
```

### Directory
```
https://github.com/{owner}/{repo}/tree/{ref}/{path}
```

### GitLab (note `/-/blob/`)
```
https://gitlab.com/{owner}/{repo}/-/blob/{ref}/{path}
```

## Ref Resolution

| Source | Use as ref |
|--------|------------|
| Known version | `v{version}` |
| Default branch | `main` or `master` |
| opensrc fetch | ref from result |
| Specific commit | full SHA |

## Examples

### Correct
```markdown
The [`parseAsync`](https://github.com/colinhacks/zod/blob/main/src/types.ts#L450-L480) method handles...
```

### Wrong
```markdown
See https://github.com/colinhacks/zod/blob/main/src/types.ts#L100
The parseAsync method in src/types.ts handles...
```

## Line Numbers

- Single: `#L42`
- Range: `#L42-L50`
- Prefer ranges for context (2-5 lines around key code)

## Registry → GitHub

| Registry | Find repo in |
|----------|--------------|
| npm | `package.json` → `repository` |
| PyPI | `pyproject.toml` or setup.py |
| crates | `Cargo.toml` |
