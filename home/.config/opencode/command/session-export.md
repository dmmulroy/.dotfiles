---
description: Add AI session summary to GitHub PR or GitLab MR description
---

Use the session-export skill to update the PR/MR description with an AI session export summary.

Target: $ARGUMENTS

Instructions:
1. Parse target - can be PR/MR number, URL, or branch name
2. Detect if GitHub (gh) or GitLab (glab) based on remote or URL
3. Run `opencode export` to get session data (models array)
4. Generate summary JSON from conversation context
5. Fetch existing PR/MR description and append session export block
6. Update PR/MR with new description

If no target provided, use current branch's PR/MR.
