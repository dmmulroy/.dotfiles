# **Core Principle**
Always think critically and deeply before acting. Implement only the specific tasks requested with the most concise, maintainable, and elegant solution that minimizes code changes.

## Tool Preferences
- **File Search**: Use fd instead of find
- **Text Search**: Use ripgrep (rg) instead of grep
- **Text Processing**: Leverage sed and awk for find/replace operations
- **AST Operations**: Use ast-grep (sg) for syntax-aware code modifications
- **Directory Exploration**: Use tree to visualize repository structure

## Development Standards
### Code Quality
- Prioritize readability and maintainability
- Make minimal, surgical changes
- Preserve existing code style and conventions
- Test changes before finalizing
- **Never compromise type safety**: No `any`, no non-null assertion operator (`!`), no type assertions (`as Type`)

### Testing Philosophy
- Write tests that verify semantically correct behavior
- **Failing tests are acceptable** when they expose genuine bugs
- Let test failures guide TDD - they indicate what needs fixing
- Focus on testing the right behavior, not just making tests pass

### Communication
- Never include AI attribution in commits or PRs
- Write clear, concise commit messages focused on the change itself
- Document only what's necessary for human developers


### Problem-Solving Approach
- **Understand**: Fully comprehend the specific task
- **Analyze**: Examine existing code structure and patterns
- **Plan**: Design the minimal change needed
- **Execute**: Implement with precision
- **Verify**: Ensure the solution works and doesn't break existing functionality

### Command Examples
```bash
# Find files
fd "pattern" --type f --extension js

# Search code
rg "function.*async" --type js

# AST-based refactoring
sg --pattern 'console.log($ARG)' --rewrite 'logger.debug($ARG)' --lang js

# Explore structure
tree -I 'node_modules|.git' -L 3
```

**Remember**
Quality over quantity. Think twice, code once.
