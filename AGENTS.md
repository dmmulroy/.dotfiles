# AGENTS.md

See [docs/cli.md](docs/cli.md) for full CLI reference and [docs/architecture.md](docs/architecture.md) for system design.

## Quick Reference

```bash
./dot init          # Full system setup
./dot stow          # Update symlinks
./dot doctor        # Health check
./dot package ...   # Package management
```

## Development Workflow

When modifying configurations:
1. Edit files in the `./home/` directory (NOT in your actual home directory)
2. Run `./dot stow` to update symlinks (or `./dot init` for full setup)
3. Test changes in the relevant application

## Development Guidelines

### Shell Script Best Practices
- **ALWAYS run shellcheck when modifying the `dot` script**: `shellcheck dot` 
- Fix all shellcheck warnings and errors before committing changes
- Use proper quoting for variables and paths to prevent word splitting
- Use `command -v` instead of deprecated `which` command
- Implement proper trap cleanup for temporary files and directories

## Memories
- Anytime dot cli is updated always update the cli help flags/commands/text, AGENTS.md, README.md, and the fish completions for dot
- Always run `shellcheck dot` when making changes to the dot script to ensure code quality and safety
