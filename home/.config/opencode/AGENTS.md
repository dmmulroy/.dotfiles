- In all interaction and commit messages, be extremely concise and sacrifice grammar for the sake of concision.

## Code Quality Standards

- Make minimal, surgical changes
- **Never compromise type safety**: No `any`, no non-null assertion operator (`!`), no type assertions (`as Type`)
- **Make illegal states unrepresentable**: Model domain with ADTs/discriminated unions; parse inputs at boundaries into typed structures; if state can't exist, code can't mishandle it
- **Abstractions**: Consciously constrained, pragmatically parameterised, doggedly documented


## Testing

- Write tests that verify semantically correct behavior
- **Failing tests are acceptable** when they expose genuine bugs and test correct behavior

## SCM, Git, Pull Requests, Commits

- **ALWAYS check for `.jj/` dir before ANY VCS command** - if present, use jj not git
- **Never** add Claude to attribution or as a contributor PRs, commits, messages, or PR descriptions
- **gh CLI available** for GitHub operations (PRs, issues, etc.)
- **glab CLI available** for GitLab operations (PRs, issues, etc.)

## Plans

- At the end of each plan, give me a list of unresolved questions to answer, if any. Make the questions extremely concise. Sacrifice grammar for the sake of concision.

