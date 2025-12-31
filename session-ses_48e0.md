# Creating custom opencode command for chat export

**Session ID:** ses_48e066beaffesT2cy5UffNlhXl
**Created:** 12/30/2025, 8:15:40 PM
**Updated:** 12/30/2025, 8:16:12 PM

---

## User

how would you create a custom opencode command to open the entire chat/message session in the $EDITOR (maybe this already exsits?) ultrathink

---

## Assistant

```
Tool: webfetch

```

---

## Assistant

```
Tool: webfetch

```

```
Tool: webfetch

```

```
Tool: webfetch

```

---

## Assistant

Let me check if there's an existing built-in command or keybind for this, and look at the TUI docs for more context:

```
Tool: webfetch

```

```
Tool: webfetch

```

---

## Assistant

This is interesting. There's already a `/export` command that exports the conversation to Markdown and opens it in `$EDITOR`. But if you want more control or want to export in a different format, here's how you could create a custom command:

---

## Existing Solution: `/export`

OpenCode already has this! The `/export` command (keybind: `ctrl+x x`) exports the current conversation to Markdown and opens it in your `$EDITOR`.

---

## Custom Command Approach

If you want more control (e.g., different format, include tool results, JSON export), create a custom command using a plugin + shell command:

### Option 1: Simple Markdown Command

Create `~/.config/opencode/command/open-session.md`:

```markdown
---
description: Open session in editor
---
Export this conversation in full markdown format, then I'll open it in my editor.
```

Not ideal since it relies on the LLM.

### Option 2: Plugin with SDK (Full Control)

Create `~/.config/opencode/plugin/open-in-editor.js`:

```javascript
export const OpenInEditorPlugin = async ({ client, $ }) => {
  return {
    "tui.command.execute": async ({ command }) => {
      if (command !== "/open-in-editor") return

      // Get current session
      const sessions = await client.session.list()
      const current = sessions.data?.find(s => s.status === "idle")
      if (!current) return

      // Get all messages
      const messages = await client.session.messages({
        path: { id: current.id }
      })

      // Format as markdown
      let md = `# Session: ${current.title || current.id}\n\n`
      for (const msg of messages.data || []) {
        const role = msg.info.role === "user" ? "User" : "Assistant"
        md += `## ${role}\n\n`
        for (const part of msg.parts) {
          if (part.type === "text") md += part.text + "\n\n"
          if (part.type === "tool-invocation") {
            md += `\`\`\`\n${JSON.stringify(part, null, 2)}\n\`\`\`\n\n`
          }
        }
      }

      // Write to temp file and open in editor
      const tmpFile = `/tmp/opencode-session-${current.id}.md`
      await Bun.write(tmpFile, md)
      await $`$EDITOR ${tmpFile}`
    }
  }
}
```

Then create the command trigger in `~/.config/opencode/command/open-in-editor.md`:

```markdown
---
description: Open full session in $EDITOR
---
```

This is overkill for most cases though.

### Option 3: Shell-based Command (Simplest Custom)

If you just want to tweak the export format, you could use the OpenCode CLI:

```markdown
---
description: Export session to editor
---
!opencode session export --format md | $EDITOR -
```

Though I'm not 100% sure the CLI supports this exact invocation - would need to check the CLI docs.

---

## Recommendation

Just use **`/export`** or **`ctrl+x x`** - it already does exactly what you want. Make sure your `$EDITOR` env var is set (looks like you have nvim configured).

If you need JSON or want to include tool invocation details, the plugin approach gives full control via the SDK's `session.messages()` API.

---

