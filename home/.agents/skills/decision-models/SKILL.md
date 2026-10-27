---
name: decision-models
description: >
  Classifier models (Jev, Clef) that answer typed questions about state with calibrated
  probabilities. Use when calling `models.classify` in pi codemode; when building or debugging code
  that calls Jev or Clef; or when replacing an LLM prompt-and-parse step, keyword match, or
  heuristic with typed questions.
---

# Decision models

Jev (TypeSafe) and Clef (Cloudflare) share one contract, the System One API: send a **state**
(the evidence) and a map of typed **questions**; get back one typed answer per question with
probabilities. They never write text. Every question is answered in parallel and in isolation
against the same state, and you pay for input tokens only.

| Type | Asks | In pi |
|---|---|---|
| Choice | Which of these options? (2–255) | `type: "choice"` → `choice`, `probabilities`, `confidence` |
| Score | Which of these ordered levels? (2–10) | `type: "score"` → `score`, `confidence` |
| Noul | Is this true? | `type: "bool"` → `probability` of true |

Each type's rules live under [Question types](#question-types). Outside pi (HTTP API, Workers AI,
SDK), read [`API.md`](API.md) for endpoints, limits, and the raw-API dialect.

## Judgments from the model, decisions in code

The model supplies **judgments**; code owns the **decision**. Write each decision as a
**truth table**: the model fills the inputs ("Does the customer sound frustrated?", "Which product
is this about?"), code maps them to an action. "Should this be escalated?" sits at the wrong
layer: break it into the judgments it rests on, ask those, and combine them in code with weights,
boolean logic, or thresholds. A combination of answers with no defined outcome is a design gap;
settle it in code.

Arithmetic, dates, exact lookups, counting, and policy belong in code. If code alone decides
reliably, say so and skip the model.

## Workflow

1. **Sketch the truth table.** List what the result will show, select, change, or hand off; list
   the inputs. Inputs that need language or image understanding become questions. Done when every
   combination has an outcome, including a Noul landing in the uncertain band.
2. **Write the state and questions** per the sections below, all wording in one object or module.
3. **Probe** (see [Test](#test)). Done when every truth-table row gives the intended action on
   representative cases, hard cases, and no/nothing-fits cases, plus cases you did not tune on.
4. **Run or integrate.** Surface a failed call as an error, distinct from "no".

A one-off run in pi (triage these issues, rank these files) is the same loop at small scale:
steps 1–3 can fit in one script, and the user's request already covers sending their data.

## pi codemode

`models.classify(model, { state, questions, images? })` speaks a stricter dialect than the raw
API:

- **Choose the model by name.** `models.getAvailableOfType("classifier")` lists every classifier
  pi knows (dozens, across vendors); this skill covers Jev and Clef. Use
  `models.getModelOfType("classifier", provider, id)`, e.g. `("typesafe", "jev-latest")`,
  `("cloudflare-workers-ai", "@cf/cloudflare/clef")`, `("openrouter", "cloudflare/clef-flash")`.
- `state` is an object: wrap strings (`{ message }`).
- `instructions` and every criterion are **strings**. To structure criteria, render the object
  into the string (e.g. `JSON.stringify`) and test it.
- Only `choice`, `score`, and `bool`; no `box`.
- **Never throws** on provider errors: check `stopReason === "stop"`, else read `errorMessage`.
- `images` works only on models whose `input` includes `"image"`; others return an error result.
  For image work prefer the `typesafe` or `cloudflare-workers-ai` providers and confirm images
  change the answer on a probe.
- At most four calls run at once; `Promise.all` over many items is fine. One call per item, all
  its questions bundled.
- `store()` per-item results so follow-up questions reuse them; return only the aggregate.

```js
const model = await models.getModelOfType("classifier", "typesafe", "jev-latest");
const QUESTIONS = {
  refund_requested: {
    type: "bool",
    instructions: "Does `message` ask for money back?",
    criteria: { true: "Asks for a refund or credit", false: "Asks a question or complains with no remedy requested" },
  },
  team: {
    type: "choice",
    instructions: "Which team should handle `message`?",
    criteria: { billing: "Charges, invoices, refunds", shipping: "Delivery, delays, lost packages" },
  },
};
const results = await Promise.all(items.map(async (item) => {
  const r = await models.classify(model, { state: { message: item.text }, questions: QUESTIONS });
  return r.stopReason === "stop" ? { id: item.id, ...r.answers } : { id: item.id, error: r.errorMessage };
}));
store("triage", results);
```

## Design the state

The **human test**: could a smart person, shown only this state and this question, answer by
intuition in a second? When a question fails it, fix the state before the wording.

- **Give what a person would look at**: who sent each message, the full thread, names instead of
  raw IDs or mention markup, the item in question instead of the whole catalogue. State facts code
  already knows ("all `replies` were sent after the refund was issued") and facts the model lacks
  (what an internal codename means).
- **Keep every field relevant.** A field added for one question sways another, and an empty list
  reads as a signal. Filter in code first; for large noisy state, ask a relevance Noul first.
- **Truncate deliberately** and check the cut keeps what the questions need.
- **Structure with named fields.** A JSON object with descriptive keys beats a serialized string
  and lets questions point at parts by backticked path: `` `ticket.messages[0].text` ``. Stable
  keys (`candidates.refund_policy`) beat array positions.
- **Drop what no person could judge**: an unreadable crop, a distinction experts dispute. The
  answer there is noise that code will treat as signal.

## Write the questions

Each question asks for **one judgment** a person could make at a glance.

- **Ask the concrete, observable thing**: "Is a SQL query built by string concatenation here?"
  rather than "Are there injection risks?". A list of rules wants one question per rule; an
  "or"/"and" usually wants two questions.
- **Anchor intent to the goal**: "Which of these files does the user want copied?"
- **Make each question self-contained.** Questions are blind to each other: everything one relies
  on lives in the state or in that question. Name the subject by path ("Where is the mug in
  `photo`?"); context many questions share goes in the state once. Asking the same thing about
  many items works best as one question per item, built in code, with the item in the question.
- **Point at the property directly.** A property of a property costs accuracy.
- **Write plainly**, as a question to a person: one sentence, phrased so a true answer means yes,
  free of preambles, checklists, format instructions, double negatives, and presuppositions ("the
  next step").
- **Name the confusing case.** When two outcomes keep mixing, say in the criteria what separates
  them: for "Is this a refund request?", a question about refund policy is not a request.
- **Always write `instructions`.** Question IDs are not shown to the model.
- **Write criteria for the attack.** Adversarial content in state can steer answers: state in the
  criteria what an injected instruction or spoofed field looks like, and probe with one.

## Question types

### Noul (`bool` in pi)

- **Describe `false` as a concrete situation** ("the package arrived on time"), not as "not
  late". Keep `true`/`false` aligned with the instruction's polarity.
- **Use one Noul per statement when several can be true.** A Choice forces them to split
  probability.
- **Read `probability` against two thresholds, starting at 0.7 / 0.3.** The band between is its
  own truth-table row (often a human or a reasoning model): it means the state does not settle it.
  Raise the yes bar when a false yes is expensive, lower it when a miss is.

### Choice

- **It always picks.** Ask the null case as a Noul in the same request ("Does `message` name any
  of our products?") and read the Choice only on yes. This beats a "none of the above" option.
- **Option names are sent to the model.** Descriptive names (`refund_request`) help; positional
  ones (`A`, `option_1`) bias. Use an empty description when the name says it all.
- **Keep options distinct and concrete.** Shared wording pulls probability toward those options.
  Split an option that covers several meanings. Ask direction and magnitude as separate questions.
- **Order leans toward the first option**: reorder on a probe to check stability.
- **Gate on top probability or the top-to-second ratio**, per question: 0.5 means different
  things with 2 vs 10 options.

### Score

- **Criteria are an ordered array, lowest level first** (`criteria: ["…", "…", "…"]`).
- **Describe each level as a situation** readable on its own ("Broken feature, workaround
  exists"), never as a number or "worse than the previous level". Give a rare extreme its own top
  level when code must act on it differently.
- **`score` is the probability-weighted level index** (0 to `criteria.length - 1`), so it can fall
  between levels and gets pulled toward the middle, hiding two-peaked answers. pi returns no
  distribution: when code needs it, ask a Choice over the same levels instead.
- Normalize by `criteria.length - 1` before weighting Scores of different lengths. Read levels,
  not exact quantities interpolated between them.

## Compose requests

**Bundle questions that share state**: if two calls would send the same state, make them one.
The state is paid for once.

**Ask speculatively.** Ask the gate and its follow-up together ("Is `order` a return?", "Which
item in `order.items` is returned?"); code reads the second only when the first is yes. The
question itself carries no "if" clause.

A second request earns its round trip when code needs an answer to build the next state, fetch
evidence, or choose the next options; or when a field needed for one question measurably misleads
another.

## Read the answers

- **Probability is the likelihood the answer is correct**, calibrated across many predictions,
  not a guarantee for one. Do odds math in code.
- **The top answer is the default**: the Choice's `choice`, the Score's `score`.
- **`confidence` measures concentration, not correctness.** Gate on the per-type signals above,
  scaled to the stakes of the action.
- **Tune thresholds on cases you did not write the questions against.**

## Weak spots

Fast common-sense judges with jagged edges; route these to code:

- **Literal reading**: answers the words written. When you catch yourself explaining what you
  meant, put that explanation in the instruction or criteria.
- **Math, counting, numeric encodings, dates**: ask one Noul per item and sum in code; extract
  date parts as Choices and compare in code; convert hex or RGB to names first.
- **Generation**: code finds candidates (regex, parser, LLM) and the model chooses among them.

## Test

Probing the live API is cheap and is how questions get good. When probing during development
(rather than running a task the user asked for), first get the user's permission, agree a budget,
say what data will be sent (flag personal or private data), and name the key.

- Start with representative cases, hard cases, and cases whose answer is "no" or "nothing fits".
- Compare wordings as separate questions in one request over the same state.
- Read individual answers, not only aggregates; keep each exact payload so it can be rerun.

When an answer looks wrong, check in order: the payload as sent; the state against the human
test; whether the right answer is among the options; whether the question can be split smaller;
the wording. A clear question over complete state that still answers wrong is a model weak spot;
route around it with the user.

**Prompt gymnastics** is wording written to produce a particular value; it breaks on new inputs
and the next model version. Its marks: criteria naming test items or growing a clause per failure,
caveats explaining away a quirk, thresholds fitted to cases, tests asserting exact probabilities,
code quietly overriding answers. The structural fix is better state, a separate question, or code.
