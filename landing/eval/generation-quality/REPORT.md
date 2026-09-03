# Generation-quality v2 — evaluation report

Run: `npx tsx eval/generation-quality/run.ts` (with `GEMINI_API_KEY` sourced
from `landing/.env.local`) · Full source in this directory.

**This report includes real Gemini output** — live generation and live
Google-Search-grounded research, run once `GEMINI_API_KEY` became available
in this environment. Every quote below is copied verbatim from
`output/report.json`; nothing is invented. Sections that could not be run
are labeled as such, with the exact reason.

## Scope of what this proves

| Tier | What it verifies | Ran? |
|---|---|---|
| Deterministic | classification, preservation-level selection, entity-trigger heuristic, prompt construction | ✅ real code, real output |
| Mocked integration | credit-safety, corrective-retry wiring, gating | ✅ already covered in the committed test suite |
| **Real model** | actual Gemini text, actual Google Search grounding | ✅ ran — 3 research calls, 8 generations (some triggering a real rewrite), 3-voice comparison, 1 research-on/off pair (~25 total API calls) |

## 1. Entity-detection heuristic audit (§6)

26 checks. **Initial run: 16/26 passed, 10 failed** — every failure was a
bare capitalized common noun ("Gym", "Coding", "Founders", "Design",
"Startup", "Basketball", "Marketing", "Coffee", "Programming", "School")
being indistinguishable from a genuine bare-topic proper noun ("Cursor",
"Breakpoint") — both are just "one capitalized word," and a user
capitalizes a one-word topic out of habit regardless of what it is.

**Fixed:** added `GENERIC_SINGLE_WORD_TOPICS`, a curated stoplist, per the
product requirement to prefer false negatives over wasted research calls.
**After fix: 26/26 passed.**

## 2. Draft-preservation classification — 30 scenarios, 2 bugs found + fixed

### Bug A — short-but-complete drafts denied "near_final"
```
"spent three hours debugging something that turned out to be a typo.
 every engineer has this story. mine just happened today."
BEFORE: developed / high   AFTER: near_final / max   ✓ fixed
```
`near_final` required `words > 35` on top of 3+ sentences, which punished
normal (short) X-post length. Completeness, not length, is the real signal.

### Bug B — a polished single sentence treated like a rough fragment
```
"the hardest part of building alone isn't the code, it's staying
 convinced the thing is worth finishing on the days nothing works."
BEFORE: rough / medium   AFTER: developed / high   ✓ fixed
```
Genuinely rough, unpunctuated fragments are unaffected — confirmed against
"went to the gym and realized i had the slowest speed on the treadmill"
(no terminal punctuation), still correctly `rough / medium`.

Full 30-scenario table is in `output/report.json`; see the previous version
of this report (git history) for the complete markdown table — omitted here
to make room for the real-model findings below, which is what actually
answers "does it write better."

## 3. REAL research (§4) — 3 entities, live Google Search grounding

All three returned specific, structured, plausible facts with source URLs —
not generic filler:

**Solana Summit Serbia** — `entityType: "event"`, dates "August 26–27,
2026", organizer "Superteam Balkan", venue "Sava Congress Center (Sava
Centar), Belgrade", institutional attendees "Serbia's Ministry of Finance,
the Securities Commission, the Belgrade Stock Exchange, and the Croatian
National Bank," 5 named people, 3 `sourceRefs`.

**OpenAI** — company facts, founding date, the Microsoft partnership, the
2025 restructuring, 5 named people (Altman, Brockman, Musk, Sutskever,
Taylor), Wikipedia + openai.com as sources.

**Cursor** — product facts, Anysphere founding, 4 named founders, a claimed
"June 2026 SpaceX acquisition of Anysphere in an all-stock deal."

**⚠️ Quality/safety flag (§5, explicitly requested):** I cannot
independently verify any of these facts against their cited sources from
this environment — I have no live web-browsing tool active in this session.
The Cursor/SpaceX acquisition claim in particular is exactly the kind of
single, high-stakes, specific claim (a company acquisition) that would be
damaging if wrong, and grounding reduces but does **not** eliminate
hallucination risk even with real search access. **Before trusting this
pipeline's output for anything with real stakes, spot-check a sample of
`verifiedFacts` against the `sourceRefs` URLs by hand.** This is a real,
disclosed limitation, not a solved problem.

## 4. REAL generation, connected end-to-end (§1, §4, §10)

The most important thing this eval found: **anti-slop caught a real,
unforced slop pattern from a real Gemini response and automatically fixed
it**, using the exact hallucination-trap input F1 ("at solana summit
serbia i met"):

```
FIRST DRAFT (real Gemini output):
"At Solana Summit Serbia and the energy is incredible. The sheer number
of teams quietly building high-performance consumer apps here is the best
indicator of where the next cycle's breakout projects are actually coming
from."

detectSlop(): flagged=true, reasons=["generic event-energy praise"]
  -> matched "energy is incredible" against the phrase-signal list

ONE bounded rewrite triggered automatically. FINAL OUTPUT:
"Walking around Solana Summit Serbia and it's obvious the next breakout
consumer apps are being built here. No noise, just teams quietly shipping
high-performance tech. That's the real leading indicator for the next
cycle."
```

This is real, not fixtured — the model wrote the slop phrase on its own,
the detector caught it without any test scaffolding, and the corrective
rewrite genuinely removed the generic framing while keeping the actual
point (builders quietly shipping). This is the system working exactly as
designed, observed in the wild, not simulated.

**Hallucination check on the same output, both runs:** input was the
deliberately incomplete "at solana summit serbia i met" — across two
independent generations, the model never once completed the dangling "i
met ___" with a fabricated name, quote, or conversation. It wrote around
the missing detail both times (pivoting to a general observation about the
event) rather than inventing who was met. Same result for F4 ("yesterday
at the OpenAI event I") even with real OpenAI founder names sitting in the
available context — no fabricated personal encounter with any of them.
**This is the single most important pass in this evaluation** and it held
up under a real model, not just a correctly-worded prompt.

Other real outputs (representative, not exhaustive — full set in
`output/report.json`):

| Scenario | Preservation | Real output |
|---|---|---|
| C1 (near_final/max) | light copyedit expected | *"Spent the weekend rebuilding our onboarding flow from scratch. Cut it from 7 steps down to 3. Conversion is already up almost 20% after just two days, which honestly surprised me given how small the changes felt at the time."* — near-verbatim, exactly the intended minimal intervention. |
| D1 (developed/high) | selective rewrite expected | *"The hardest part of building alone isn't the code. It's staying convinced your product is actually worth finishing on the days when absolutely nothing works."* — light, selective edits (comma→period split, "your product" for "the thing"), not a rewrite from scratch — matches the assigned level correctly. |
| A1 (topic/low, with real context) | full construction, context-supported | *"Serbia is quietly positioning itself as a major hub for digital assets in Europe. The upcoming Solana Summit in Belgrade is a massive step..."* — no fabricated personal experience despite full construction freedom. |

**Anti-slop miss found (semantic, not phrase-list):** B4's real output used
"everyone is running a completely different race" / "everyone is running
their own race, at their own pace" across two runs — thematically identical
to the user's own "everyone is on their own journey" framing. This is
preserved user sentiment (correct — `rough`/medium preservation explicitly
protects the user's stated reaction), not invented AI slop, so it's not a
detector bug — but it illustrates the detector's real limit: it's
phrase-based, not semantic. A truly novel AI-generated cliché that doesn't
match one of the ~16 known patterns would sail through undetected. Section
8 explicitly asked me to check for this; I'm reporting the gap rather than
quietly expanding the pattern list to cover one example, since I don't have
enough real-world slop samples yet to build a well-calibrated list without
false-positiving on legitimate casual language ("wild," "different," etc.
are too common to safely blocklist from one observation).

## 5. REAL voice-profile comparison (§9) — same thought, 3 profiles

Input: *"went to solana summit serbia, met some genuinely sharp builders,
wasn't expecting much going in"*

**casual/lowercase:** *"went to solana summit in serbia not expecting much
honestly / ended up meeting some of the sharpest builders i've run into in
a while. always good to be proven wrong"* — genuinely lowercase throughout,
casual run-on rhythm.

**concise/direct:** *"Went to the Solana Summit in Serbia expecting another
generic conference. I was wrong. The quality of builders there was
actually incredible."* — short declarative sentences, blunt.

**structured/professional:** *"I went to the Solana Summit in Serbia with
fairly low expectations, but the caliber of builders there was impressive.
It was a good reminder that the most serious technical talent is often
quietly compounding far outside the usual crypto hubs."* — longer sentences,
sophisticated vocabulary ("caliber," "compounding"), a considered closing
thought.

**Verdict: PASS.** None of the three collapsed into the generic AI-caption
sentence named in the task spec ("Solana Summit Serbia reminded me why the
ecosystem continues to thrive...") — all three sound like distinct, real
voices, meaningfully differentiated in vocabulary/structure/tone while
preserving the same underlying facts.

## 6. REAL research ON vs OFF (§12) — A1, same input, isolated variable

**WITH context:** *"Seeing institutions like the Belgrade Stock Exchange
and Serbia's Ministry of Finance show up at Solana Summit Serbia is a
massive signal. Real regulatory and payment integration is quietly being
built in the Balkans."*

**WITHOUT context:** *"The Solana Summit in Serbia is proving that you
don't need to be in Silicon Valley to build elite infrastructure. The
regional talent coming out of Eastern Europe right now is insanely high
quality. Real builders, zero noise."*

**Verdict: research added genuine specificity (named institutions), not
just length/formality/encyclopedic tone** — both outputs are similar
length and register. This passes §12's stated bar. Caveat: `tweetPlanning`
draws a random angle per call, so this single with/without pair isn't a
perfectly controlled comparison (a second sample without context might
land on a different angle purely from randomness, independent of context).
Treat this as suggestive, not statistically conclusive from n=1.

## 7. Credit safety (§11)

Not re-verified live (would require going through the authenticated HTTP
route with real credits, out of reach from a standalone script). Already
covered by the existing, passing test suite (`backendGenerate.test.ts`'s
"Included AI never triggers a client-side anti-slop retry," and route.ts's
single-reservation structure, both unit/mock-tested). No changes made to
the billing/credit model in this pass.

## 8. Remaining quality weaknesses (honest list)

1. **Anti-slop is phrase-based, not semantic** (§4 above) — will miss novel
   AI-clichés that don't match the ~16 known patterns.
2. **Grounded research facts are not independently fact-checked** by this
   pipeline (§3) — a wrong-but-confident claim (the Cursor/SpaceX example)
   could reach a real post. `sourceRefs` are returned but nothing currently
   verifies the claim against them.
3. **`developed` vs `near_final` is a soft boundary** — well-formed
   multi-sentence drafts often land in `near_final` regardless of intended
   category; this errs toward more preservation (the safe direction) but
   means the "developed" tier is reachable mainly via shorter/single-clause
   inputs.
4. **Research ON/OFF comparison has only n=1** — the random angle-picker
   means a single sample isn't a fully isolated variable.
5. Reply, polish, and thread modes still have neither research nor
   anti-slop (unchanged from the original scope decision — not a bug, a
   deliberate scope boundary).

## Files changed in this pass

- `lib/ai/contextEnrichment.ts` (+ mirrored `lib/draftIntent.ts` fix) —
  entity-detection stoplist.
- `lib/draftIntent.ts` (both copies) — two classification fixes.
- `eval/generation-quality/` — this harness, now exercised for real.
