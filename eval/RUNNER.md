# Evaluation Runner

`eval/run-pilot.ts` — a standalone, dependency-free CLI that runs the
frozen premise-diversity pilot: 3 arms (A = baseline, B = random-angle,
C = premise-first) × 4 topics × 6 generations = 72 outputs. Never writes
to `extension/` or `landing/`. It does import two production files
directly at generation time — `extension/lib/gemini.ts` and
`extension/lib/openrouter.ts` — so the pilot's generation call is the
exact same code, request shape, and fixed temperature/token settings
production actually uses, not a reimplementation. Everything else (arm
prompts, RULES text) is read as literal copies (see the `SOURCE OF TRUTH`
comments in `eval/lib/arms.ts` and `eval/lib/prompt-shared.ts`).

## Which production model gets benchmarked

`EVAL_PROVIDER`, at the top of `eval/run-pilot.ts` — the single, obvious
source of truth. One line, no CLI flag, no registry:

```ts
const EVAL_PROVIDER = "gemini"                // extension/lib/gemini.ts
const EVAL_PROVIDER = "groq"                  // extension/lib/openrouter.ts's callGroq()
const EVAL_PROVIDER = "openrouter:grok-4"      // extension/lib/openrouter.ts's callOpenRouter(), any model id
```

Changing that constant is the only thing required to benchmark a
different provider. The pilot always benchmarks exactly one provider per
run — there's no multi-provider comparison mode.

> Always benchmark the same provider you intend to ship. If you're
> evaluating prompt changes for Groq, benchmark Groq. If you're evaluating
> Gemini, benchmark Gemini. The benchmark should measure the production
> experience, not an arbitrary model.

## Requirements

- Node ≥ 22.6 (native TypeScript execution; confirmed working unflagged on
  Node 24). No `package.json`, no dependencies, no build step.
- A real API key for whichever provider `EVAL_PROVIDER` selects — that's
  the **only** credential required, since judging (clustering, postability
  scoring) reuses the same `EVAL_PROVIDER` as generation. Export it as an
  environment variable — **never** passed as a CLI flag (would leak into
  shell history):
  ```bash
  export EVAL_GEMINI_API_KEY=...       # if EVAL_PROVIDER = "gemini"
  export EVAL_GROQ_API_KEY=...         # if EVAL_PROVIDER = "groq"
  export EVAL_OPENROUTER_API_KEY=...   # if EVAL_PROVIDER = "openrouter:<model-id>"
  ```
  Deliberately separate from production's stored keys (`landing/.env.local`'s
  `GEMINI_API_KEY`, the extension's BYOK key) — this tool never reads or
  shares product credentials.

## Usage

```bash
node eval/run-pilot.ts run
```

Generates all 72 outputs, then runs the two judging steps (clustering —
one call per topic; postability — one call per output), then writes one
worksheet for you to fill in by hand:

```
outputs/pilot/
  raw/<topic>::<arm>::<index>.json     # every raw generation, verbatim
  judged/
    blinding-key.json                   # OUT-## -> (topic, arm, index) — never show this to yourself while scoring the worksheet
    cluster__<topic>.json                # per-topic premise clusters
    postability__<outId>.json             # per-output postability score
    surprise-worksheet.json                # YOU FILL THIS IN (null "score" fields)
  report.md                               # written by "report", not "run"
```

The run is **resumable**: re-running the same command skips any raw
generation or judging unit that already succeeded, and retries only what
previously failed — safe to re-run after a network blip without
re-spending on completed work. Pass `--force` to redo everything from
scratch instead.

### Filling in the worksheet (required — this is not automated)

Open `outputs/pilot/judged/surprise-worksheet.json`. For each session, set
`score` (0, 1, or 2 — the rubric is printed at the top of the file) on
every generation after the first. This has to come from a human, not the
same judge scoring everything else — arm identity is deliberately not
shown in the file, so score it blind.

### Generating the report

```bash
node eval/run-pilot.ts report
```

Refuses to run until the worksheet is fully filled in and every
`(topic, arm)` has all 6 generations judged. Writes
`outputs/pilot/report.md`: a recommendation paragraph first — one of
**Ship Arm C** / **Do not ship Arm C** / **Inconclusive, expand the
evaluation** — followed by per-arm/topic metrics, the success-criteria
table, the ambiguity-condition checks, and every raw generation as an
evidence appendix.

## Flags

| Flag | Default | Notes |
|---|---|---|
| `--run-id` | `pilot` | Name a run yourself if running more than one in parallel |
| `--force` | off | Regenerate/rejudge everything instead of resuming |

Nothing else is configurable — the generation provider/model is
`EVAL_PROVIDER` at the top of `run-pilot.ts` (see above); persona, tone,
length are hardcoded in `eval/lib/prompt-shared.ts`; topics, repetitions,
and arms are hardcoded alongside `EVAL_PROVIDER` in `run-pilot.ts` and in
`eval/lib/arms.ts`. Edit those files directly if the pilot itself needs to
change; that's expected to be rare.
