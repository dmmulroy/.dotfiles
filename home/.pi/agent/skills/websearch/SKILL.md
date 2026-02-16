---
name: websearch
description: Search the public web using the Exa-backed websearch tool. Use this when the user asks for up-to-date facts, external docs, release notes, APIs, or anything not reliably present in the local repo.
---

# Websearch Skill

Use this skill whenever the task requires information from the internet.

## Tool to use

- `websearch`

## Workflow

1. Turn the user request into a focused query.
2. For time-sensitive requests, include the current year in the query.
3. Run `websearch` with sensible defaults:
   - `numResults`: `8`
   - `type`: `auto`
   - `livecrawl`: `fallback`
4. If results are weak, retry with:
   - broader or narrower wording
   - `type: "deep"` for harder research tasks
   - 1-2 follow-up searches instead of one huge query
5. Summarize findings clearly and include source URLs when available in results.

## Notes

- Prefer multiple targeted searches over one vague search.
- If a search fails or times out, explain that to the user and retry with a simpler query.
- If the request is purely local-repo work, do not use websearch.
