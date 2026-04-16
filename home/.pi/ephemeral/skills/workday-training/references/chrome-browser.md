# Google Chrome — CDP Connection Reference

Chrome has full CDP support. It's the most straightforward browser to connect to.

## DevToolsActivePort Location

| Platform | Path |
|----------|------|
| macOS | `~/Library/Application Support/Google/Chrome/DevToolsActivePort` |
| Linux | `~/.config/google-chrome/DevToolsActivePort` |
| Windows | `%LOCALAPPDATA%\Google\Chrome\User Data\DevToolsActivePort` |

## Connection Methods

### Method 1: DevToolsActivePort (recommended)

```bash
# macOS
PORT=$(head -1 ~/Library/Application\ Support/Google/Chrome/DevToolsActivePort)
GUID=$(tail -1 ~/Library/Application\ Support/Google/Chrome/DevToolsActivePort)
export CDP="ws://127.0.0.1:${PORT}${GUID}"

agent-browser --cdp "$CDP" tab
```

### Method 2: Launch with explicit port

```bash
# macOS
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222

# Linux
google-chrome --remote-debugging-port=9222

# Windows
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
```

Then connect with just the port (HTTP discovery works on Chrome):

```bash
agent-browser --cdp 9222 tab
```

### Method 3: Auto-connect

Chrome supports the standard HTTP discovery endpoints (`/json/version`, `/json/list`), so auto-connect works:

```bash
agent-browser --auto-connect tab
```

### Method 4: chrome://inspect (Chrome 144+)

Chrome 144+ has a UI toggle at `chrome://inspect/#remote-debugging` that enables remote debugging on a dynamic port. Auto-connect discovers this automatically via the `DevToolsActivePort` file.

## Chrome-Specific Notes

- **HTTP discovery works** — Unlike some Chromium forks, `http://localhost:<port>/json/version` and `/json/list` return valid responses. Port-based connection (`--cdp <port>`) works fine.
- **Profile separation** — If Chrome runs with multiple profiles, each has its own user data directory. The `DevToolsActivePort` file is in the active profile's data directory.
- **Extensions** — Chrome extensions load in both headed and headless mode. If an extension interferes with automation, use `--disable-extensions` when launching.
