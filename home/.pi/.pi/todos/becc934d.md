{
  "id": "becc934d",
  "title": "Update agent/cloak.json to catch Cloudflare Access secrets",
  "tags": [
    "config",
    "security"
  ],
  "status": "done",
  "created_at": "2026-04-01T13:22:32.463Z"
}

Updated `agent/cloak.json` with a JSON/JSONC rule that masks values for `CLOUDFLARE_ACCESS_TEAM_DOMAIN` and `CLOUDFLARE_ACCESS_AUD`. Verified the regex against the provided sample.
