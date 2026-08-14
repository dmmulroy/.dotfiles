# .pi

Global pi config, synced via dotfiles and stowed into `~/.pi`.

## Extension dependency workspace

Package-style global extensions stay in `agent/extensions/` so pi can still auto-discover them from:

- `~/.pi/agent/extensions/*.ts`
- `~/.pi/agent/extensions/*/index.ts`

This directory is now the shared npm workspace root for extensions with their own `package.json` files.

Install or refresh all extension dependencies from here:

```bash
npm install
```

Run workspace checks:

```bash
npm run check
```

Current workspace-managed extensions live under:

- `agent/extensions/opencode-cloudflare`
- `agent/extensions/pi-skill-toggle`
- `agent/extensions/save-md`

Pi Web Tools is maintained at [dmmulroy/pi-web-tools](https://github.com/dmmulroy/pi-web-tools) and installed through `agent/settings.json` as a Git package.

After changing extension code or package settings, reload pi with `/reload`.
