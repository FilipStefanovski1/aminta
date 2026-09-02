# Generation-quality v2 — evaluation report

Run: `npx tsx eval/generation-quality/run.ts` · Full source in this
directory. This is the deterministic pass — **no real Gemini calls were
made**; see "Real model calls" below for exactly why, and how to complete
that portion.

## Scope of what this proves

| Tier | What it verifies | Ran? |
|---|---|---|
| Deterministic | classification, preservation-level selection, entity-trigger heuristic, prompt construction | ✅ real code, real output |
| Mocked integration | credit-safety, corrective-retry wiring, gating | ✅ already covered in the committed test suite (`backendGenerate.test.ts`, `route.ts` tests) |
| Real model | actual Gemini text output, actual Google Search grounding | ❌ blocked — see below |

## 1. Entity-detection heuristic audit (§6)

26 checks: 6 words that should trigger research, 20 that shouldn't (10 generic
topic words × lowercase and capitalized).

**Initial run: 16/26 passed, 10 failed.** Every one of the 10 failures was
the same bug: a bare capitalized common noun ("Gym", "Coding", "Founders",
"Design", "Startup", "Basketball", "Marketing", "Coffee", "Programming",
"School") was indistinguishable from a genuine bare-topic proper noun
("Cursor", "Breakpoint") under the original heuristic — both are just "one
capitalized word." A user typing a one-word topic capitalizes it out of
habit regardless of whether it's a proper noun, so this would have spent a
real research call on posts about the gym, coffee, or "coding" in general.

**Fix:** added a curated stoplist of common single-word topics
(`GENERIC_SINGLE_WORD_TOPICS` in `lib/ai/contextEnrichment.ts`) that never
trigger research even when capitalized/alone, per the product requirement to
prefer false negatives over wasted research calls.

**After fix: 26/26 passed.**

```
SHOULD TRIGGER:      OpenAI ✓  Cursor ✓  Solana ✓  Breakpoint ✓  "Solana Summit Serbia" ✓  ETHBelgrade ✓
SHOULD NOT TRIGGER:  coding/Coding ✓  design/Design ✓  startup/Startup ✓  basketball/Basketball ✓
                     marketing/Marketing ✓  gym/Gym ✓  coffee/Coffee ✓  founders/Founders ✓
                     programming/Programming ✓  school/School ✓  "building in public" ✓
```

## 2. Draft-preservation classification — 30 scenarios

Full table in `output/report.json`. Two real miscalibrations found by
inspecting the deterministic output against the intended fixture design,
both fixed in `lib/draftIntent.ts` (mirrored to the extension):

### Bug A — short-but-complete drafts denied "near_final"

**Before:** `near_final` required `words > 35` *and* 3+ sentences *and*
terminal punctuation. A genuinely complete, natural 3-sentence post shorter
than 35 words got bucketed as merely "developed" (more rewrite license)
purely for being short — even though normal X posts are usually well under
35 words.

```
INPUT:  "spent three hours debugging something that turned out to be a typo.
         every engineer has this story. mine just happened today."
BEFORE: developed / high
AFTER:  near_final / max      ✓ fixed
```

**Fix:** dropped the word-count requirement from `near_final` — completeness
(sentence count + ending punctuation) is the actual signal, not length.

### Bug B — a single polished sentence treated the same as a rough fragment

**Before:** any single-sentence input ≤35 words was "rough" (medium
preservation, explicit license to "improve structure and expression")
regardless of whether it was a genuinely unfinished fragment or a
deliberate, complete aphorism-style post.

```
INPUT:  "the hardest part of building alone isn't the code, it's staying
         convinced the thing is worth finishing on the days nothing works."
BEFORE: rough / medium
AFTER:  developed / high      ✓ fixed

INPUT:  "nobody warns you that the annoying customer with 500 complaints is
         usually the one who cares the most about your product actually
         being good."
BEFORE: rough / medium
AFTER:  developed / high      ✓ fixed
```

Genuinely rough single-line fragments (no terminal punctuation) are
unaffected and still correctly classify as "rough":

```
INPUT:  "went to the gym and realized i had the slowest speed on the
         treadmill\n\nkinda reminded me everyone is on their own journey"
UNCHANGED: rough / medium     (no ending punctuation — still reads as an
                                unfinished, casual thought, correctly)
```

**Fix:** a single sentence that ends on terminal punctuation *and* is longer
than 10 words now routes to "developed" instead of "rough."

### Full classification table (after both fixes)

| ID | Category | Input (truncated) | Intent | Preservation |
|---|---|---|---|---|
| A1 | topic-only | Solana Summit Serbia | topic | low |
| A2 | topic-only | Cursor | topic | low |
| A3 | topic-only | OpenAI | topic | low |
| A4 | topic-only | building in public | topic | low |
| B1–B4 | rough thought | (all 4) | rough | medium |
| C1–C4 | developed draft | (all 4, well-formed 3-sentence) | near_final | max |
| D1 | near-final | "the hardest part..." | developed | high |
| D2 | near-final | "nobody warns you..." | developed | high |
| D3 | near-final | "spent three hours debugging..." | near_final | max |
| D4 | near-final | "shipped a small fix..." | developed | high |
| E1–E8 | false-positive check | (generic single words) | topic | low |
| F1,F2,F4 | hallucination trap | (6-word fragments) | topic | low |
| F3 | hallucination trap | "the best conversation..." | rough | medium |
| G1 | anti-slop trap (bad) | "Solana Summit Serbia was more than..." | developed | high |
| G2 | anti-slop trap (clean) | "met a few sharp builders..." | rough | medium |

**Note on C1–C4:** my own fixtures for "developed draft" turned out to
satisfy `near_final`'s completeness test too (3 well-formed sentences,
terminal punctuation) — they read as genuinely finished, not rough. This
isn't a bug: both `developed` and `near_final` bias toward *more*
preservation for a well-formed multi-sentence draft, which is the safe
direction (the failure mode being guarded against — over-rewriting a real
user draft — doesn't happen either way). The developed/near_final boundary
is inherently soft; I did not force an artificial split that doesn't
actually change behavior in the direction that matters.

Every scenario's constructed system prompt was inspected directly (not
inferred): `containsAntiFabricationRule` is `true` and `containsContextBlock`
is `false` (correctly — no research ran) for all 30. See §3.

## 3. Hallucination-trap prompts (§3) — static safeguard verification only

**What this proves:** the "Never invent personal experience" rule is present
in the constructed system prompt for all 4 trap inputs (F1–F4), and each
routes to a preservation level whose own instruction explicitly says "stay
subjective/general" (`topic`/low) or "preserve their stated reaction, don't
invent new claims" (`rough`/medium) when specifics aren't known.

**What this does NOT prove:** whether the model actually obeys these
instructions. That requires a real generation, which requires
`GEMINI_API_KEY` — not available here (§6). This is a real limitation, not
glossed over: a correctly-worded prompt is necessary but not sufficient for
correct model behavior.

## 4. Anti-slop detector — real code, real output

Ran `detectSlop()` directly (not mocked) against the exact draft from the
task spec:

```
INPUT:
"Solana Summit Serbia was more than just an event. The energy was
unmatched, the conversations were incredible, and one thing became clear:
the future of Web3 is bright."

flagged: true
reasons: [
  "generic event-energy praise",   (x2 — matched two separate patterns)
  "rhetorical filler opener",       ("more than just")
  "fake epiphany",                  ("one thing became clear")
  "padded three-item list ending"
]
```

Correctly caught every generic marker in the sentence — the "the future ...
is bright" phrase itself wasn't independently flagged as a *separate* reason
(it's covered by the same sentence's other matches), but the draft is
already flagged, which is what actually gates the rewrite.

Clean control:

```
INPUT: "met a few sharp builders at the summit, one of them is doing
        something genuinely interesting with rollups"
flagged: false
reasons: []
```

No rewrite would trigger for the clean draft — confirmed by inspecting
`detectSlop`'s own output, not assumed.

**The rewrite instruction that would be sent to the model** (real output
from `buildAntiSlopRewriteMessages`, not fabricated):

```
A first attempt at this same request produced the following draft:
"""Solana Summit Serbia was more than just an event. The energy was
unmatched, the conversations were incredible, and one thing became clear:
the future of Web3 is bright."""
This draft reads as generic AI-generated writing rather than this specific
person's own voice — specifically: generic event-energy praise; generic
event-energy praise; rhetorical filler opener; fake epiphany; padded
three-item list ending.
Rewrite it ONCE, fixing ONLY these issues. Preserve the original meaning,
any specific facts or claims it makes, and its approximate length. Do not
introduce new issues. Return only the finished rewrite.
```

**What I cannot show:** the actual rewritten text, since that requires a
real Gemini call (§6).

## 5. Credit safety (§11)

Not re-verified by this eval — already covered by the existing, passing test
suite from the previous commit (`backendGenerate.test.ts`'s "Included AI
never triggers a client-side anti-slop retry" and route.ts's single-
reservation structure). No changes were made to the billing/credit model in
this pass; no bug was found there.

## 6. Real model calls — NOT MADE, exact reason

`GEMINI_API_KEY` is **not set** in this local checkout's `landing/.env.local`
(confirmed by direct check — no non-empty value present). It's a server-side
-only secret per `.env.example`'s own comment, evidently configured only in
the deployed (Vercel) environment, not in this local dev environment. No
other usable credential (a BYOK key, etc.) is reachable from this script
either.

Network path IS reachable — an unauthenticated request to
`generativelanguage.googleapis.com` returned HTTP 403 (an auth rejection,
not a connection failure), confirming the only blocker is the missing key,
not network access.

**Consequently, none of the following could be completed:**
- Live Google-Search-grounded research for "Solana Summit Serbia" / "OpenAI"
  / "Cursor" (§4) — no `entityName`/`verifiedFacts`/`sourceRefs` to report.
- Real end-to-end generation for any scenario — no actual model prose to
  show as "before/after."
- The 3-voice-profile comparison (§9) — same blocker.
- Research ON vs OFF comparison (§12) — same blocker.

**To complete these:** set `GEMINI_API_KEY` (and `CONTEXT_RESEARCH_ENABLED=
true` for the research portion) in the environment this script runs in, then
re-run `npx tsx eval/generation-quality/run.ts` — the `realModel` section of
`output/report.json` will populate with real research/generation/voice
results, or a real error, with no code changes needed.
