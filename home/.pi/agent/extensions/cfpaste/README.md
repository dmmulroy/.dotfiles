# cfpaste

Pi extension for creating Markdown pastes on Cloudflare Paste.

## Usage

```text
/cfpaste path/to/file.md
/cfpaste last
```

`/cfpaste <path>` reads a `.md` or `.markdown` file relative to Pi's working directory. `/cfpaste last` pastes the latest agent message on the active session branch. Both commands preserve the Markdown source and return a rendered URL ending in `/markdown`.

Authentication uses `cloudflared access token`. If Paste rejects the cached token, the extension runs `cloudflared access login`, waits for browser approval, and retries once.
