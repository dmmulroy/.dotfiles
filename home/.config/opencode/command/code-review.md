---
description: Review changes with parallel @code-review subagents
agent: plan
---
Review the code changes using THREE (3) @code-review subagents and correlate results into a summary ranked by severity. Use the provided user guidance to steer the review and focus on specific code paths, changes, and/or areas of concern.

Guidance: $ARGUMENTS

First, call `skill({ name: 'vcs-detect' })` to determine whether the repo uses git or jj, then use the appropriate VCS commands throughout.

Review uncommitted changes by default. If no uncommitted changes, review the last commit. If the user provides a pull request/merge request number or link, use CLI tools (gh/glab) to fetch it and then perform your review.
