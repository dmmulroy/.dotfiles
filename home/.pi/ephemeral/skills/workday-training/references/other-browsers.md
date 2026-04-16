# Other Chromium Browsers — CDP Connection Reference

All Chromium-based browsers support CDP. The main differences are the user data directory path and whether HTTP discovery endpoints are available.

## DevToolsActivePort Locations

### Brave

| Platform | Path |
|----------|------|
| macOS | `~/Library/Application Support/BraveSoftware/Brave-Browser/DevToolsActivePort` |
| Linux | `~/.config/BraveSoftware/Brave-Browser/DevToolsActivePort` |
| Windows | `%LOCALAPPDATA%\BraveSoftware\Brave-Browser\User Data\DevToolsActivePort` |

### Microsoft Edge

| Platform | Path |
|----------|------|
| macOS | `~/Library/Application Support/Microsoft Edge/DevToolsActivePort` |
| Linux | `~/.config/microsoft-edge/DevToolsActivePort` |
| Windows | `%LOCALAPPDATA%\Microsoft\Edge\User Data\DevToolsActivePort` |

### Arc

| Platform | Path |
|----------|------|
| macOS | `~/Library/Application Support/Arc/User Data/DevToolsActivePort` |

### Vivaldi

| Platform | Path |
|----------|------|
| macOS | `~/Library/Application Support/Vivaldi/DevToolsActivePort` |
| Linux | `~/.config/vivaldi/DevToolsActivePort` |
| Windows | `%LOCALAPPDATA%\Vivaldi\User Data\DevToolsActivePort` |

### ungoogled-chromium

| Platform | Path |
|----------|------|
| macOS | `~/Library/Application Support/Chromium/DevToolsActivePort` |
| Linux | `~/.config/chromium/DevToolsActivePort` |

⚠️ ungoogled-chromium (like Helium) may have HTTP discovery endpoints disabled. Use the full WebSocket URL from `DevToolsActivePort`.

### Chromium (vanilla)

| Platform | Path |
|----------|------|
| macOS | `~/Library/Application Support/Chromium/DevToolsActivePort` |
| Linux | `~/.config/chromium/DevToolsActivePort` |

## Generic Connection Pattern

```bash
PORT=$(head -1 "<path-to-DevToolsActivePort>")
GUID=$(tail -1 "<path-to-DevToolsActivePort>")
export CDP="ws://127.0.0.1:${PORT}${GUID}"

agent-browser --cdp "$CDP" tab
```

## Launching with Remote Debugging

If the browser doesn't have remote debugging enabled by default, launch it with:

```bash
<browser-executable> --remote-debugging-port=9222
```

### Executable paths (macOS)

| Browser | Path |
|---------|------|
| Brave | `/Applications/Brave Browser.app/Contents/MacOS/Brave Browser` |
| Edge | `/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge` |
| Arc | `/Applications/Arc.app/Contents/MacOS/Arc` |
| Vivaldi | `/Applications/Vivaldi.app/Contents/MacOS/Vivaldi` |

## HTTP Discovery Compatibility

| Browser | `/json/version` works? | Port-based `--cdp <port>` works? | `--auto-connect` works? |
|---------|----------------------|--------------------------------|------------------------|
| Chrome | ✅ | ✅ | ✅ |
| Brave | ✅ | ✅ | ✅ |
| Edge | ✅ | ✅ | ✅ |
| Arc | ✅ | ✅ | ✅ |
| Vivaldi | ✅ | ✅ | ✅ |
| ungoogled-chromium | ❌ | ❌ | ❌ |
| Helium | ❌ | ❌ | ❌ |

For browsers where HTTP discovery doesn't work, always use the full WebSocket URL from `DevToolsActivePort`.
