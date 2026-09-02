# Generation-quality v2 evaluation

Dev-only evaluation harness for the draft-preservation / anti-fabrication /
context-enrichment / anti-slop system (commit `2150a14` and follow-ups).
Not part of the test suite, not imported by app code, not run in CI.

## Run it

```bash
cd landing
npx tsx eval/generation-quality/run.ts
```

Writes `eval/generation-quality/output/report.json`. Two tiers:

- **Deterministic** (always runs, zero network calls): draft-intent
  classification, preservation-level selection, the entity-detection
  heuristic audit, and full system-prompt construction for every scenario
  in `scenarios.ts`, plus local anti-slop detection on the fixed bad/clean
  draft pair.
- **Real model** (only if `GEMINI_API_KEY` is set in the environment): live
  Google-Search-grounded research calls for 3 named entities, real
  generation + anti-slop rewrite for a representative subset of scenarios,
  and a 3-voice-profile comparison. If the key is absent, this section is
  recorded as `{ ran: false, reason: "..." }` with the exact blocker — never
  faked.

## Files

- `scenarios.ts` — synthetic fixture inputs (not real user content),
  covering topic-only / rough / developed / near-final / research
  false-positive / hallucination-trap / anti-slop-trap categories, plus
  three StyleProfile fixtures for voice comparison.
- `run.ts` — the runner described above.
- `output/report.json` — generated, gitignored-style scratch output (safe
  to regenerate any time; not treated as a source of truth, the code is).
- `REPORT.md` — the human-readable findings from the most recent full pass,
  including concrete bugs found and fixed.
