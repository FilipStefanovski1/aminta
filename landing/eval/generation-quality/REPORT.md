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
