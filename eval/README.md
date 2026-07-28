# Aminta Generation-Quality Evaluation Harness

Infrastructure for evaluating what Aminta's generation system **actually
produces**, not what the prompts theoretically ask for. This directory
contains no product code and ships nowhere — it's a QA tool.

## Why this exists

`extension/lib/promptQuality.test.ts` verifies *prompt construction*
(does `buildMessages()` include the right length target, the right
anti-cliché rule, etc.) — it never calls a real model. That's a useful,
fast, deterministic regression guard, but it cannot tell you whether
Gemini/Groq/OpenRouter actually *follow* those instructions, or whether
the output reads like something a real person would post.

This harness closes that gap: a fixed, reproducible benchmark + a scoring
rubric + a failure taxonomy + a report template, so real generations
(pasted back from the actual extension) get evaluated consistently instead
of impressionistically.

## Files

| File | Purpose |
|---|---|
| `personas.md` | 3 voice-profile fixtures (with real example posts) to paste into Settings → Train, so "style consistency" scoring has something concrete to check against. |
| `benchmark.md` | 35 fixed scenarios (10 post, 10 reply, 5 polish, 5 image-reply, 5 template-generate) — same topics/inputs as `promptQuality.test.ts`, extended with a persona assignment and manual reproduction steps for the real extension UI. |
| `scoring-rubric.md` | The 9 required dimensions, 1–10, with concrete anchors at each score band — so two different scoring passes (or two different people) land on similar numbers. |
| `failure-taxonomy.md` | Definitions + concrete textual patterns for every recurring-failure category the evaluation should tag (AI cadence, weak openings, generic agreement, image hallucination, etc.). |
| `report-template.md` | The exact structure the final evaluation report will follow once real outputs exist — per-scenario evidence chain, mode/provider comparisons, prompt-waste findings, missing-context findings, summary. |
| `results/` | Where pasted generations get recorded, one file per run (see below). Empty until a real run happens. |

## Workflow

1. **Set up personas.** Open the extension → Settings → Train, and create
   the voice profile described in `personas.md` for whichever persona a
   scenario calls for (switching personas means re-entering that profile —
   there's no multi-profile support in the product, see the extension's
   `CLAUDE.md` "Known Limitations").
2. **Run each scenario in `benchmark.md`** through the real extension —
   the exact mode/tone/length/input to use is spelled out per scenario, so
   this is copy-paste, not judgment calls.
3. **Record outputs** using the paste format below, one block per
   scenario, and hand them back in chat (or drop them in
   `eval/results/<date>-<provider>.md` if you'd rather save them here
   first).
4. **Evaluation happens after that** — only once real outputs exist. The
   evaluator scores every output against `scoring-rubric.md`, tags failures
   against `failure-taxonomy.md`, and fills in `report-template.md` with
   real evidence chains (Input → Output → Why weak → Root cause → Fix).
   No prompt gets touched unless the evidence repeatedly points at the same
   root cause.

## Paste-back format

Label every output with its scenario ID from `benchmark.md` so it maps
back unambiguously. If you're comparing providers, suffix the ID with the
provider:

```
P01: <the generated text>
P01-Included: <the generated text, if also run through Included AI>
P02: <the generated text>
...
R01: <the generated text>
...
IR01: <the generated text>
IR01-note: <briefly, what the attached image actually showed — needed to
             judge whether the reply used it correctly or hallucinated>
...
```

For image-aware replies specifically, also note what the image *actually*
contained (in your own words) — without that, a hallucination can't be
distinguished from a correct inference.

## What this harness deliberately does not do

- It does not call any provider API itself. No key exists in this
  environment; even if one did, the point is to evaluate what the *actual
  product* produces for a *real* user, not a sandboxed approximation.
- It does not pre-judge quality. No scores exist until real outputs are
  scored.
- It does not modify any prompt. See `extension/lib/prompts.ts` /
  `landing/lib/ai/prompts.ts` — untouched by this work.
