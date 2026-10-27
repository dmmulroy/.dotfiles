# Decision models: HTTP API and live docs

The application-code branch of [`decision-models`](SKILL.md): calling Jev or Clef outside pi. In pi, use `models.classify` instead (see the pi codemode section of `SKILL.md`).

The live docs are the source of truth for request syntax, limits, and model behaviour; the table below is a snapshot, so read the relevant page during the task.

## Surfaces

| | Jev | Clef / Clef-flash / Clef-omni |
|---|---|---|
| Endpoint | `POST https://api.typesafe.ai/v1/systemone`, model `jev-latest` or a pinned version | Workers AI `env.AI.run("@cf/cloudflare/clef", { model: "clef", … })` or `/ai/run/@cf/cloudflare/clef`; self-host via SGLang `/v1/systemone` |
| Context | 64k per request / 32k per question; 262k with `TypeSafe-Danger-Zone-Long-Context: true` | Clef 64k, Clef-flash **24k** hosted, omni 64k |
| Overflow | 400 `max_tokens_exceeded` | **long text state is silently truncated**: measure size yourself |
| Questions | no count cap; context is the limit | **1–64 per request**: split above that |
| Media | text; images and `box` behind `TypeSafe-Danger-Zone-Images: true` | `images` (≤4 PNG/JPEG/WebP data URLs); omni adds `audio`, `videos` |
| Strengths | reasoning-heavy judgments | intent and tool routing, calibration, latency |

Swapping between them is a change of endpoint and `model`.

## Raw API extras

pi's dialect is stricter; on the raw API:

- Yes/no is `type: "noul"` and the answer field is `noul`.
- Score answers include `probabilities` and `legend`.
- `instructions` and criteria accept objects or arrays: give confusable options the same fields (`what`, `not_for`, `examples`). Field names are yours and the model reads them.
- `box` returns four edges as fractions of the image (Jev, experimental). Like a Choice, it always answers: pair it with a Noul asking whether the thing is present.

## Integration

- Pin a versioned model once thresholds are tuned: aliases move and answers move with them. Log each response's `model` field.
- Log the exact request payload so any answer can be rerun.

## Live docs

- TypeSafe: index at `https://docs.typesafe.ai/llms.txt` (append `.md` to any page path). Covers primitives, confidence, patterns (fan-out, confidence routing, composite scoring, intent routing), the jaggedness page for the current Jev, and cookbooks. Start from the cookbook closest to the use case: function calling, value and date extraction, re-ranking, RAG passage filtering, citation checks, extraction cascades, hierarchical classification, guardrails.
- Clef: `https://developers.cloudflare.com/ai/models/@cf/cloudflare/clef/index.md` (and `clef-flash`, `clef-omni`); schemas at `…/schema-input.json` and `…/schema-output.json`; weights and self-hosting at `https://huggingface.co/Cloudflare/clef`.
