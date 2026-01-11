---
name: session-export
description: Update GitHub PR or GitLab MR descriptions with AI session export summaries. Use when user asks to add session summary to PR/MR, document AI assistance in PR/MR, or export conversation summary to PR/MR description.
---

# Session Export

Update PR/MR descriptions with a structured summary of the AI-assisted conversation.

## Output Format

```markdown
> [!NOTE]
> This PR was written with AI assistance.

<details><summary>AI Session Export</summary>
<p>

```json
{
  "info": {
    "title": "<brief task description>",
    "agent": "opencode",
    "models": ["<model(s) used>"]
  },
  "summary": [
    "<action 1>",
    "<action 2>",
    ...
  ]
}
```

</p>
</details>
```

## Workflow

### 1. Export Session Data

Get session data using OpenCode CLI:

```bash
opencode export [sessionID]
```

Returns JSON with session info including models used. Use current session if no sessionID provided.

### 2. Generate Summary JSON

From exported data and conversation context, create summary:

- **title**: 2-5 word task description (lowercase)
- **agent**: always "opencode"
- **models**: array from export data
- **summary**: array of terse action statements
  - Use past tense ("added", "fixed", "created")
  - Start with "user requested..." or "user asked..."
  - Chronological order
  - Attempt to keep the summary to a max of 25 turns ("user requested", "agent did")
  - **NEVER include sensitive data**: API keys, credentials, secrets, tokens, passwords, env vars

### 3. Update PR/MR Description

**GitHub:**
```bash
gh pr edit <PR_NUMBER> --body "$(cat <<'EOF'
<existing description>

> [!NOTE]
> This PR was written with AI assistance.

<details><summary>AI Session Export</summary>
...
</details>
EOF
)"
```

**GitLab:**
```bash
glab mr update <MR_NUMBER> --description "$(cat <<'EOF'
<existing description>

> [!NOTE]
> This MR was written with AI assistance.

<details><summary>AI Session Export</summary>
...
</details>
EOF
)"
```

### 4. Preserve Existing Content

Always fetch and preserve existing PR/MR description:

```bash
# GitHub
gh pr view <PR_NUMBER> --json body -q '.body'

# GitLab
glab mr view <MR_NUMBER> --output json | jq -r '.description'
```

Append session export after existing content with blank line separator.

## Example Summary

For a session where user asked to add dark mode:

```json
{
  "info": {
    "title": "dark mode implementation",
    "agent": "opencode",
    "models": ["claude sonnet 4"]
  },
  "summary": [
    "user requested dark mode toggle in settings",
    "agent explored existing theme system",
    "agent created ThemeContext for state management",
    "agent added DarkModeToggle component",
    "agent updated CSS variables for dark theme",
    "agent ran tests and fixed 2 failures",
    "agent committed changes"
  ]
}
```

## Security

**NEVER include in summary:**
- API keys, tokens, secrets
- Passwords, credentials
- Environment variable values
- Private URLs with auth tokens
- Personal identifiable information
- Internal hostnames/IPs
