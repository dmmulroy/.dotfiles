# Helium Browser — CDP Connection Reference

[Helium](https://helium.computer/) is a privacy-focused Chromium fork by imputnet, based on ungoogled-chromium. It supports CDP but has specific quirks that differ from standard Chrome.

## DevToolsActivePort Location

| Platform | Path |
|----------|------|
| macOS | `~/Library/Application Support/net.imput.helium/DevToolsActivePort` |
| Linux | `~/.config/net.imput.helium/DevToolsActivePort` |
| Windows | `%LOCALAPPDATA%\net.imput.helium\DevToolsActivePort` |

## Connection

```bash
PORT=$(head -1 ~/Library/Application\ Support/net.imput.helium/DevToolsActivePort)
GUID=$(tail -1 ~/Library/Application\ Support/net.imput.helium/DevToolsActivePort)
export CDP="ws://127.0.0.1:${PORT}${GUID}"

agent-browser --cdp "$CDP" tab
```

## ⚠️ Known Quirks

### HTTP discovery endpoints return 404

Unlike standard Chrome, Helium's CDP server does **not** respond to the standard HTTP discovery endpoints:

- `http://localhost:<port>/json/version` → **404**
- `http://localhost:<port>/json/list` → **404**

This means:

- **`agent-browser --cdp <port>`** (port-only mode) **will NOT work** — it relies on HTTP discovery to find the WebSocket URL
- **`agent-browser --auto-connect`** **will NOT work** — same reason
- You **must** use the full WebSocket URL from the `DevToolsActivePort` file

This is inherited from ungoogled-chromium, which strips Google-specific service endpoints.

### Dynamic port assignment

Helium assigns a random port for remote debugging each launch (it does not default to 9222). Always read the port from `DevToolsActivePort` rather than hardcoding.

### Enabling remote debugging

Helium enables remote debugging automatically when the `DevToolsActivePort` file is present. You can also launch it explicitly:

```bash
# macOS
"/Applications/Helium.app/Contents/MacOS/Helium" --remote-debugging-port=9222

# With explicit port, you can use the full WebSocket URL:
# ws://127.0.0.1:9222/devtools/browser/<guid>
# But you still need the GUID from DevToolsActivePort or /json/version
# Since /json/version returns 404 on Helium, always use DevToolsActivePort.
```

### Ad-blocker may affect page content

Helium ships with a fork of uBlock Origin that blocks ads and trackers aggressively. This may affect automation if:

- SCORM modules load resources from blocked domains
- Third-party scripts needed by the training platform are blocked

If a lesson fails to load properly, try disabling the ad-blocker for the Workday domain in Helium's settings.

### Profile directory

Helium's user data directory (for `--profile` or state import):

| Platform | Path |
|----------|------|
| macOS | `~/Library/Application Support/net.imput.helium/` |
| Linux | `~/.config/net.imput.helium/` |
| Windows | `%LOCALAPPDATA%\net.imput.helium\` |
