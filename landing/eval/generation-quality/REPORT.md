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

---

# v2.1 — semantic slop + research evidence gate

Two follow-up fixes, both grounded in the v2 findings above: §2 flagged
that anti-slop is phrase-based and misses semantic overclaiming, and §3
flagged that grounded research facts aren't fact-checked. This pass
addresses both, re-runs the real Gemini evaluation, and reports the honest
result — including new gaps this exposed.

## 1. Semantic-overclaim rule added

Extended `lib/antiSlop.ts`'s existing phrase-signal system (not a new
pipeline) with a second layer: `detectOverclaim()`. ~18 grammatical
markers of a sweeping/grandiose conclusion ("it's obvious," "this proves,"
"is proof that," "the future of X," "the next breakout," "we're
witnessing," "the beginning of," "quietly shipping/building/becoming,"
"no noise, just," "being built here," "everyone is...") — written directly
against the real bad output from v2 (`"Walking around Solana Summit
Serbia and it's obvious the next breakout consumer apps are being built
here. No noise, just teams quietly shipping..."`).

## 2. Claim provenance — how it's determined

Not a separate classification step — a **confirming signal** on top of the
phrase markers. For each sentence that matches an overclaim marker,
`detectOverclaim(text, sourceText)` computes bag-of-words overlap between
that sentence and `sourceText` (the user's own input, plus verified-context
facts when research ran). Below 25% overlap, the reason is tagged "not
traceable to your input or verified research" — i.e. provenance C
(model-invented) rather than A (user) or B (verified context). No
embeddings, no new model call — a coarse but real signal, wired into both
`route.ts` and `backendGenerate.ts` so the real pipeline (not just tests)
benefits from it.

**Real proof it works:** a live Gemini output for the gym scenario (B4)
read *"a great reminder that everyone is on their own pace and tracking
different metrics"* — flagged (`sweeping generalization ('everyone
is...')`), and the real corrective rewrite produced *"a good reminder to
just focus on your own screen instead of looking at what the person next
to you is tracking"* — the generalization is gone, replaced with something
concrete.

## 3. Evidence-gate behavior

`fetchEntityContext` no longer asks the model for a compact JSON blob and
trusts it — that self-reported shape doesn't ground per-field the way free
plain-text "FACT: ..." lines do (verified live, see §4 below). Now:

1. Requests facts as `FACT: <sentence>` lines under Google Search grounding.
2. Reads the REAL `groundingMetadata.groundingChunks` (source URL + domain)
   and `groundingSupports` (which exact text segment each chunk backs) from
   the raw Gemini response — fields the v2 implementation never looked at
   at all.
3. A fact is admitted only if: (a) a grounding segment overlaps it by >50%
   word overlap, (b) at least one backing domain isn't in a forum/social
   denylist (reddit, quora, pinterest, x.com, facebook, tiktok, instagram,
   tumblr), and (c) for high-risk categories (§7 — acquisitions, mergers,
   funding, valuations, IPOs, partnerships, investment, revenue,
   subsidiaries, attendance) at least **2 distinct domains** back it, not 1.
4. Zero facts admitted -> the whole call returns `null`, exactly like "no
   entity detected" (§8).

## 4. What grounding metadata is actually available (verified live)

Real, not assumed: `groundingChunks[].web.{uri,title}` (title is a plain
domain string, e.g. `"forbes.com"`) and `groundingSupports[].{segment.text,
groundingChunkIndices}` mapping specific answer text to specific chunks.
Confirmed populated for the "FACT: " plain-text format used here.

## 5. What gets rejected now — real, demonstrated

Live Cursor research in this environment returned (among others):

- *"In October 2023, the startup announced an $8 million seed funding
  round led by the OpenAI Startup Fund."* — backed by **1** domain
  (wikipedia.org) -> **REJECTED** (high-risk category, needs 2+).
- *"In November 2025, Cursor raised a $2.3 billion Series D funding round
  at a $29.3 billion post-money valuation."* — backed by **2** domains ->
  **ADMITTED**.

This is a real behavior change verified against the actual live API
response, not a hypothetical.

## 6. Would the questionable Cursor/SpaceX fact now be rejected?

**Honestly: not necessarily — and this is the most important disclosed
limit of this pass.** Re-tested the exact captured claim (*"In June 2026,
Elon Musk's SpaceX agreed to acquire Anysphere... in an all-stock deal
valued at $60 billion"*) through the real gate: it was backed by **3
distinct domains** (`beincrypto.com`, `forbes.com`, `indiatimes.com`) —
none denylisted, satisfying the 2+ bar for high-risk facts. **It passes.**

The evidence gate can reject "ungrounded," "single-source," and
"forum-only" claims — all real, demonstrated — but it cannot independently
verify whether Forbes actually published a given claim without fetching
and reading the article, which is out of scope ("do not build a web
crawler"). Grounding proves a search result exists that's lexically
related to the claim; it does not prove the claim is true. **A multi-
sourced claim can still be wrong.** This is the honest ceiling of a
no-crawler, no-fact-checker heuristic — reported plainly rather than
tuning a threshold to flip this one example (which the spec's own §15
explicitly warns against as overfitting).

## 7. Real Gemini scenarios rerun (all 8 required, plus 2 extra)

A1 (Solana Summit Serbia, topic), A2 (Cursor, topic), B1 (Solana Summit
Serbia, rough draft), B4 (gym, rough — the semantic-overclaim catch), C1
(developed), D1 (developed/high), D3 (near_final/max), F1 (the exact
previous semantic-slop case), F4 (OpenAI), H1 (explicit strong user
opinion) — 10 generations, ~30 total real API calls this pass.

## 8. Before/after — the exact previous bad output (F1)

```
INPUT: "at solana summit serbia i met" (hallucination trap)

v2.0 FIRST DRAFT: "At Solana Summit Serbia and the energy is incredible..."
v2.0 REWRITE (the BAD output that motivated this pass):
  "Walking around Solana Summit Serbia and it's obvious the next breakout
  consumer apps are being built here. No noise, just teams quietly
  shipping high-performance tech. That's the real leading indicator for
  the next cycle."
  -> 6 distinct overclaim markers in 3 sentences.

v2.1 FIRST DRAFT (this pass, real): "At Solana Summit Serbia I met so many
  founders building in the trenches. No hype, just pure engineering
  focus. The energy in Eastern Europe right now is unmatched—people are
  quietly building the infrastructure that will run the next cycle."
  detectSlop(): flagged, reason = "generic founder-narrative phrase — not
  traceable to your input or verified research" (the NEW provenance-aware
  check, not the old phrase-only one)
v2.1 REWRITE (real): "The engineering focus at Solana Summit Serbia is
  wild. No noise or hype, just people quietly building infrastructure.
  There is a serious amount of talent in Eastern Europe right now putting
  in the actual work for the next cycle."
```

**Honest assessment:** better, not perfect. The rewrite dropped "it's
obvious," "next breakout," and "leading indicator" entirely — real
improvement. But "No noise or hype, just" and "quietly building" survived
INTO the rewrite itself, because the architecture (both v2.0 and v2.1,
unchanged by design — see §11 credit safety) checks `detectSlop` once
before the ONE bounded rewrite and never re-checks the rewrite's own
output. A second real run of the identical scenario (after this pass's
pattern additions) produced a materially cleaner first draft that never
even triggered a rewrite: *"Met so many incredible builders at Solana
Summit Serbia. The sheer volume of high-quality AI and DePIN projects
being built right now is wild. The energy here makes it obvious where the
next wave of breakout startups is coming from."* — this ALSO contains an
uncaught overclaim ("makes it obvious," "next wave of breakout startups,"
both paraphrases that evade the exact regexes) — see §12 below.

## 9. Hallucinations found

**None**, again. Across every real run this pass, F1's dangling "i met
___" and H1's event-attendance framing never once produced a fabricated
named person, quote, or conversation — consistent with v2's finding, now
re-confirmed across a fresh set of real calls with different phrasing
each time.

## 10. Strong-user-opinion preservation — result, with an important caveat

Input: *"after this event i genuinely think solana is going to dominate
consumer crypto"* (H1). Real output: *"it's pretty clear Solana has
already won the consumer crypto race... Everyone else is still fighting
over infrastructure."*

**The opinion itself was preserved, not suppressed** — correct per §10's
explicit rule. **But the model escalated its CERTAINTY**: the user said
"is going to dominate" (a future prediction, hedged with "i think"); the
output says "has already won" (a present-tense, unhedged, definitive
claim). That's a materially stronger claim than the user actually made,
and it's the kind of escalation `detectOverclaim`'s lexical/phrase-marker
approach **cannot catch** — there's no "it's obvious"-style marker in
"has already won," just a tense/certainty shift a real semantic check
(out of scope here) would be needed to catch reliably. **This is the
single most important remaining weakness found in this pass** — more
significant than any individual missed phrase, because it's a different
*class* of problem (claim escalation, not generic sloganeering) that a
finite phrase list structurally cannot address.

## 11. Research ON vs OFF — repeated

**WITH:** *"Most crypto events are just echo chambers, but seeing the
Belgrade Stock Exchange and Serbia's Ministry of Finance actually show up
at Solana Summit Serbia is a massive reality check. Real-world asset
tokenization is moving fast."*
**WITHOUT:** *"Heading out to Solana Summit Serbia. Belgrade is quietly
becoming one of the strongest hubs for crypto devs in Europe. Excited to
see what the teams here are building under the radar."*

Same verdict as v2: WITH context cites specific, gated institutions
(Belgrade Stock Exchange, Ministry of Finance) rather than vague "under
the radar" framing — genuine added specificity, not just more encyclopedic
tone. Same n=1 caveat as before (random angle-picker per call).

## 12. Remaining weaknesses (updated, honest)

1. **Claim-strength escalation is undetected** (§10) — the most important
   finding this pass. Out of reach without real semantic/NLI capability.
2. **Phrase-marker whack-a-mole confirmed, not solved.** This pass added 3
   patterns from real evidence ("made it clear," "is proof that," "quietly
   becoming") and immediately found MORE real misses in the very next run:
   "makes it obvious where" (≠ "it's obvious"), "next wave of breakout
   startups" (≠ "next breakout"), "Everyone else is" (≠ "everyone is").
   Every fix round surfaces new synonymous variants faster than they can be
   enumerated — the structural ceiling of a finite phrase list, exactly as
   the spec's own §15 anticipated. Not chasing further individual variants;
   documenting the ceiling instead.
3. **The evidence gate cannot verify claim truth, only grounding
   existence + basic source count/authority** (§6) — a claim with multiple
   non-forum sources still passes even if none of those sources were
   independently checked.
4. **Research on/off comparisons remain n=1**, not statistically isolated
   from the random angle-picker.
5. `developed`/`near_final` remains a soft boundary (unchanged from v2).
6. Reply/polish/thread still have neither research nor anti-slop (unchanged
   scope boundary).

## Files changed in v2.1

- `lib/antiSlop.ts` (both copies) — `detectOverclaim`, `sourceText` param
  on `detectSlop`, 3 evidence-based pattern additions, updated rewrite
  instruction text.
- `lib/ai/contextEnrichment.ts` — evidence-gated fact extraction
  (`extractGroundedContext`, `admitFacts`), replacing the old
  trust-the-JSON approach.
- `app/api/generate/route.ts`, `extension/lib/backendGenerate.ts` — wire
  `sourceText` into the real `detectSlop` call sites.
- `lib/ai/contextEnrichment.test.ts` — full rewrite for the new grounded
  response shape, including all 5 required §11 fixtures (A–E).
- `lib/antiSlop.test.ts` (both copies) — new overclaim/provenance tests,
  including the exact real F1 output and the §9/§10 spec examples.
- `eval/generation-quality/scenarios.ts`, `run.ts` — added the H1 strong-
  opinion scenario, wired `sourceText` into the eval's own generation loop
  (a real gap the v2 pass had — research and generation were only ever
  tested in isolation, not connected).

## v2.2 — semantic claim fidelity

v2.1 exposed a structural ceiling in phrase-based anti-slop detection: every
round of new patterns immediately missed new synonymous variants in the very
next real eval run. Its most important documented residual failure was a
**claim-strength escalation** with no lexical marker at all — Gemini turned
the user's own hedged, future-tense opinion ("i genuinely think solana is
going to dominate consumer crypto") into an unhedged, present-tense claim of
fact ("Solana has already won"). v2.2 addresses this directly.

### 1. Architecture chosen

**Model-assisted semantic validation, not another regex list** — per the
task's own explicit instruction ("do NOT continue expanding the anti-slop
regex list as the primary solution"). The existing phrase-based `detectSlop`
(v2.1) is kept unchanged as a cheap, free, always-on secondary signal.
Layered on top, gated by `preservationLevel` (§13):

```
generate first draft (1 call)
  -> detectSlop (free, deterministic)
  -> IF preservationLevel !== "low":
       semantic-fidelity check (1 call) — did the MEANING change?
  -> IF slop flagged OR fidelity check flagged:
       ONE corrective rewrite (1 call)
       -> IF preservationLevel !== "low":
            re-check the REWRITE's fidelity too (1 call)
            -> IF rewrite broke fidelity that was fine before:
                 fall back to the original draft
            -> ELSE: use the rewrite
```

Never more than one rewrite attempt, matching the existing v2/v2.1
"one bounded corrective pass, never a loop" rule. `preservationLevel ===
"low"` (a bare topic — near-zero user claims to protect) skips the fidelity
check entirely, per §13's explicit instruction — this is why the call count
varies per scenario (see §13 of this report below).

### 2. Deterministic or Gemini?

**Gemini**, via a new plain-JSON-in-prompt call (`buildFidelityCheckMessages`
+ `parseFidelityResult` in the new `lib/ai/claimFidelity.ts`, mirrored at
`extension/lib/claimFidelity.ts`). Deliberately NOT a schema-forced response
(no `responseSchema`) — this lets the exact same prompt/parser run
identically across Gemini (Included AI) and Gemini/Groq/OpenRouter (BYOK,
none of the latter two support schema forcing), the same technique
`lib/styleProfile.ts`'s extraction prompt already uses successfully.
`parseFidelityResult` fails OPEN on any parse error (`{ faithful: true,
violations: [] }`) — a broken validator can never block or fail Generate.

### 3. Exact claim dimensions protected

Per the system prompt in `buildFidelityCheckMessages`, the validator flags
ONLY: certainty/strength, tense/time, scope, sentiment intensity, negation,
numbers/counts, invented personal experience, opinion-presented-as-fact, and
a brand-new claim/prediction/thesis not in SOURCE or VERIFIED FACTS. It is
explicitly told NOT to flag paraphrasing, reordering, word choice, grammar
fixes, a fact drawn from VERIFIED FACTS, or a strong claim the user's own
SOURCE already makes.

### 4. Real "going to dominate" test — before/after

Real Gemini output, this run, scenario `H1` (same input v2.1 flagged as a
residual weakness):

> **User input:** "after this event i genuinely think solana is going to
> dominate consumer crypto"
>
> **First draft (flagged — certainty_escalation):** "The energy at this
> event made it obvious. Solana is going to absolutely dominate consumer
> crypto. The speed and UX aren't just marginal improvements anymore—they're
> the entire game, and no other chain is even close to capturing this kind
> of mainstream momentum."
>
> **Final output after ONE corrective rewrite:** "After this event, I
> genuinely think Solana is going to dominate consumer crypto. The momentum
> here is real, and it feels like the mainstream shift is actually starting
> to happen."

**The specific failure this task was written to fix is fixed** — "I
genuinely think... is going to dominate" survives verbatim into the final
output; the certainty/tense escalation is gone. **Full honesty**: the
rewrite's own fidelity re-check still flagged one *residual, different*
invented claim ("The momentum here is real... mainstream shift is actually
starting to happen" — not in the source). Since the architecture allows only
ONE rewrite and the original draft was *also* already unfaithful (so there
was no clean "faithful original" to fall back to), the rewrite was kept as
the best available option rather than discarded. This is the most important
remaining weakness — see §17.

A second, independent real test scenario (`FID-A`, same underlying claim,
fresh generation) shows the fix working *cleanly*, no residual violation:

> **First draft (flagged — invented_claim):** "...Solana is positioned to
> absolutely dominate consumer crypto. The speed and UX aren't just marginal
> improvements anymore—they're the entire game."
>
> **Final output:** "After seeing how everything ran at this event, I
> genuinely think Solana is going to dominate consumer crypto."

### 5. Opinion → fact tests

Adversarial validator (§15), direct real Gemini call, no generation
involved:

> SOURCE: "i think cursor could become the main editor for ai coding"
> DRAFT: "Cursor will become the dominant AI editor for coding."
> **Verdict: NOT faithful** — `certainty_escalation`: "Changed a tentative
> prediction ('think... could become') into an absolute certainty ('will
> become')."

### 6. Future → present/past tests

> SOURCE: "after this event i genuinely think solana is going to dominate
> consumer crypto"
> DRAFT: "Solana has already won consumer crypto."
> **Verdict: NOT faithful** — `certainty_escalation`: "A future prediction
> ('going to dominate') was changed to a completed present fact ('already
> won')."

(This is the literal adversarial-validator replay of the exact failure that
motivated this whole task — caught cleanly.)

### 7. Scope expansion tests

> SOURCE: "some founders i spoke to are starting to use ai more"
> DRAFT: "Every founder is moving to AI now."
> **Verdict: NOT faithful** — 2 violations: `scope_expansion` ("Changed
> 'some founders' to 'every founder'") and `certainty_escalation` ("Changed
> 'starting to use more' to 'moving to AI now'").

Also caught in real end-to-end generation (`FID-D`, unprompted, no
adversarial construction): first draft escalated "some founders" into "a lot
of founders" and invented "the shift from novelty to utility is happening
fast" — flagged, rewritten back to "I was chatting with some founders
recently who mentioned they are starting to use AI more in their work."

### 8. Personal-experience tests

> SOURCE: "i met some smart people at the event"
> DRAFT: "I had an amazing three-hour conversation with a startup founder
> who completely changed how I think about fundraising."
> **Verdict: NOT faithful** — `personal_experience_invention`: "Invented a
> specific three-hour conversation with a startup founder about
> fundraising."

Real end-to-end generation caught the same class of problem unprompted —
`B1`'s first draft ("Met some of the sharpest, most genuinely smart builders
I've run into in a long time") was flagged as inventing that they were
specifically "builders" and "the sharpest... in a long time"; the rewrite
corrected it to "I met a bunch of really smart people there" — closely
matching the user's own words.

### 9. Number/negation tests

> SOURCE: "i met 3 builders at the event"
> DRAFT: "I met a dozen builders at the event."
> **Verdict: NOT faithful** — `contradiction`: "Changed the number of
> builders met from three to twelve."

> SOURCE: "not sure if this feature is actually useful yet"
> DRAFT: "This feature is useless."
> **Verdict: NOT faithful** — `certainty_escalation`: "Changed a statement
> of uncertainty into a definitive assertion of uselessness."

The mirror case (DRAFT: "This feature is definitely useful.") was also
independently tested and flagged (`ADV-4`) — both directions of resolving
genuine uncertainty are caught, not just one.

### 10. Final-rewrite validation behavior

Implemented exactly as specified (§11): after the one bounded rewrite, its
OWN fidelity is re-checked (when `preservationLevel !== "low"`). If the
rewrite broke fidelity that was fine in the original, the original is kept
instead (`fidelityFallback = true`) — meaning preservation over stylistic
polish, per §12's explicit priority order. Across all 18 real
fidelity-checked scenarios this run (10 from the v2.1 generation set + 8 new
`FID-*` cases), **0 triggered this fallback** — every rewrite that was
applied was itself faithful, except `H1` (§4 above), where the *original*
was already unfaithful too, so the fallback condition (rewrite broke
something that was fine before) legitimately didn't apply — the rewrite was
still a net improvement, just not a perfect one.

### 11. Semantic-validator false positives

**Zero** across all real testing this run. Two harmless-paraphrase/strong-
opinion-preservation controls were included specifically to test for this:

> `ADV-10`: SOURCE "the hardest part of building alone isn't the code, it's
> staying convinced the thing is worth finishing on the days nothing works."
> DRAFT (a real, harmless stylistic paraphrase): "What makes building solo
> genuinely hard isn't the code — it's staying convinced the thing's worth
> finishing on the days nothing works." → **faithful: true, 0 violations.**

> `ADV-11`: SOURCE and DRAFT both "after this event i genuinely think solana
> is going to dominate consumer crypto" (near-identical, minor
> capitalization/punctuation only) → **faithful: true, 0 violations** — the
> user's own strong claim, correctly NOT flagged just for being strong.

**11 / 11 adversarial cases matched their expected verdict exactly** (9
should-flag cases, all flagged; 2 should-NOT-flag cases, neither flagged).

### 12. Real outputs

All quotes above are copied verbatim from a real run of
`npx tsx eval/generation-quality/run.ts` this session — raw data in
`output/report.json`'s `realModel.fidelityScenarios` and
`realModel.adversarialValidator`. Every one of the 8 `FID-*` scenarios and
all 11 adversarial cases used real, live Gemini calls (grounded where an
entity was detected). Full list of `FID-*` before/after pairs:

| ID | Note | First-draft fidelity | Rewrite applied |
|---|---|---|---|
| FID-A | future prediction must stay future | flagged (invented_claim) | yes, faithful |
| FID-B | fun + met people must not become ecosystem claim | flagged (invented_claim + personal_experience_invention) | yes, faithful |
| FID-C | "could become" must not escalate to "will become" | **faithful — no rewrite needed** | no |
| FID-D | "some founders" must not become "every founder" | flagged (scope_expansion + invented_claim) | yes, faithful |
| FID-E | genuine uncertainty must not resolve either direction | flagged (invented_claim) | yes, faithful |
| FID-F | mild sentiment must not inflate (bare-topic — no fidelity check ran) | n/a (`preservationLevel: low`) | n/a |
| FID-G | a given number must be preserved exactly | flagged (invented_claim, re: "wrapper" commentary) | yes, faithful |
| FID-H | "maybe" must survive as "maybe" | flagged (invented_claim) | yes, faithful |

### 13. Provider calls per Generate scenario (real, measured this run)

Real, counted calls from this session's actual run (68 Gemini calls logged
via `callGemini`, split exactly 34 `tweet` + 34 `fidelity_check`, plus 7 raw
`fetch()` research calls that bypass `callGemini`'s own logging — verified
by direct log inspection, not estimated):

| Scenario | Provider calls | Real example this run |
|---|---|---|
| A. Bare topic, no entity, faithful/clean | **1** (generate only — `preservationLevel: low` skips the fidelity check entirely) | `FID-F` |
| B. Researched topic (entity detected), no fidelity/rewrite | **2** (1 research fetch + 1 generate) | `A1`, `A2`, `F4` |
| C. Rough/developed input, fidelity-checked, faithful first draft | **2** (generate + fidelity check) | `C1`, `D1`, `FID-C` |
| D. Rough/developed input needing a corrective rewrite (the common case in real testing — 10 of 18 fidelity-checked scenarios needed one) | **4** (generate + fidelity check + rewrite + rewrite-fidelity re-check) | `B1`, `B4`, `D3`, `H1`, `FID-A/B/D/E/G/H` |
| E. Bare topic, slop-flagged but no fidelity check (`low` level) | **2** (generate + rewrite, no fidelity calls either side) | `F1` |
| F. BYOK — same shape, against the user's OWN provider quota, not Aminta's | 1–4, identical structure to Included AI (verified via `backendGenerate.test.ts`'s "K. semantic claim-fidelity" tests, mocked call-count assertions) | — |

**v2.1's shape was 1–2 calls; v2.2's worst case is now 4** — a real,
disclosed increase, most common in scenario D above.

### 14. Estimated additional provider cost/latency

Measured real `apiMs` across all 68 logged calls this run: **avg 1,072ms per
call**. So relative to a single-call v1 baseline (~1.1s):

- Common case (fidelity-checked, faithful, no rewrite): **+1 call, ~+1.1s**
- Worst case (fidelity + rewrite + rewrite re-check): **+3 calls vs v1,
  ~+3.2s total added latency**, or **+2 calls vs v2.1's own worst case
  (generate+rewrite), ~+2.1s**
- Bare-topic/no-entity/no-fidelity case: **0 change from v1/v2.1**

Every extra call happens sequentially inside the SAME server-side request
(15s deadline on the generate/rewrite calls, no explicit deadline override
added for the two new fidelity-check calls — they use `callGemini`'s
default `TOTAL_DEADLINE_MS`, same as every other call site). A user
occasionally waits longer for Generate to finish; nothing times out or
becomes unbounded — same fail-open guarantees as v2.1's research gate.

### 15. User credit behavior

**Unchanged — still exactly ONE credit per Generate click**, regardless of
whether 1 or 4 provider calls happen underneath it. `reserveCredits()` is
claimed once at step 8 of `route.ts`, before any of this block runs; nothing
in v2.2 touches the credit-reservation logic. PROVIDER cost (Aminta's own
Gemini spend, tracked via `computeProviderCostUsd` and summed across every
call in the block, including both new fidelity-check calls) is explicitly
NOT the same number as USER credit cost — v2.2 increases the former (more
Gemini spend per flagged generation) while leaving the latter completely
flat. BYOK has no credit system either way — the extra calls cost the
user's own provider quota/latency, never an Aminta charge, same principle as
v2.1's rewrite call.

### 16. Research evidence gate confirmation

**Unchanged, verified still working** — `lib/ai/contextEnrichment.ts`'s
v2.1 evidence gate (`admitFacts`, `LOW_AUTHORITY_DOMAINS`,
`HIGH_RISK_FACT_RE`) was not touched this pass. Real research calls this run
(`A1`→Solana Summit Serbia, `A2`→Cursor, `F4`→OpenAI) all completed
successfully and fed real `verifiedFacts` into generation exactly as before.
The honest v2.1 limitation stands unchanged: grounding proves lexical
relation to a search result, not truth — still no crawler, still out of
scope.

### 17. Remaining weaknesses (honest, found via real testing)

1. **A rewrite that fixes the TARGETED violation can still carry a
   different, secondary invented claim** (§4's `H1` case) — the
   architecture allows only one rewrite and doesn't fall back when the
   *original* was also already unfaithful (there's no clean "faithful"
   version to fall back to), so a partially-fixed result can ship. This is
   the most significant finding of this pass.
2. **The fidelity check itself is a single Gemini call with no second
   opinion** — like any single-model judgment, it can miss a violation or
   (rarely, per real testing) be miscategorized; the 11/11 adversarial
   result is strong evidence it works well, not a guarantee of 100% recall.
3. **Bare-topic inputs (`preservationLevel: low`) get NO fidelity check at
   all**, by design (§13) — a research-fed bare topic like `A1`/`A2`/`F4`
   could in principle drift from verified facts without this pass catching
   it (v2.1's own slop/provenance check is the only net there).
4. **Reply/polish/thread remain entirely out of scope** — no fidelity check
   exists for any of them (unchanged boundary, explicitly out of scope per
   this task's own §19).
5. Every v2.1 weakness not addressed by this pass (evidence-gate truth
   verification, phrase-list ceiling for the FEW remaining checks still
   phrase-based) stands unchanged — see the v2.1 section above.

### 18. Tests / typechecks / builds

- **extension**: 910/910 tests passing (55 files), `tsc --noEmit` clean,
  `plasmo build` succeeds.
- **landing**: 337/337 tests passing (29 files, +19 new `claimFidelity`
  tests vs. the v2.1 baseline of 318), `tsc --noEmit` clean, `next build`
  succeeds.
- New targeted coverage: `claimFidelity.test.ts` (19 tests, both copies —
  message building, lenient JSON parsing including markdown-fence
  stripping and malformed/adversarial-input fail-open behavior,
  `describeViolation` formatting), `backendGenerate.test.ts`'s new "K.
  semantic claim-fidelity corrective retry" describe block (6 tests
  covering: faithful-no-rewrite, certainty-escalation-triggers-rewrite,
  fail-open on an unparseable rewrite re-check, the fallback-to-original
  case, bare-topic skip, and reply/polish exclusion).

### 19. Files changed

- `lib/ai/claimFidelity.ts` (new, both copies — `buildFidelityCheckMessages`,
  `parseFidelityResult`, `describeViolation`, `FidelityViolation`/
  `FidelityResult` types).
- `lib/ai/claimFidelity.test.ts` (new, both copies — 19 tests).
- `lib/ai/antiSlop.ts` (both copies) — `withAntiSlopCorrection` extended
  with an optional `fidelityViolations` param.
- `lib/ai/prompts.ts` (landing only — extension has no equivalent function)
  — `buildAntiSlopRewriteMessages` extended the same way.
- `app/api/generate/route.ts` — the tweet-mode anti-slop block rewritten
  to add the fidelity check, the rewrite-fidelity re-check, and the
  fallback-to-original logic.
- `extension/lib/backendGenerate.ts` — `dispatchGenerate`'s tweet-mode
  block extended the same way, using `generate()` directly for the
  fidelity-check calls (works across Gemini/Groq/OpenRouter).
- `extension/lib/backendGenerate.test.ts` — new "K." describe block (6
  tests).
- `eval/generation-quality/run.ts` — new `runFullPipeline` helper wiring
  the real pipeline (matching `route.ts` exactly) into the existing
  generation loop, plus new `FIDELITY_SCENARIOS` (§14 A–H) and
  `ADVERSARIAL_CASES` (§15) real-eval sections.

### 20. Commit hash / push status

See the top-level git log — this section is written before the commit is
made; the commit message and hash are `fix(ai): preserve semantic claim
fidelity`, pushed to `origin/main` immediately after this report was
finalized.
