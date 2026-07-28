# Voice-Profile Personas

Three fixed voice profiles to paste into the extension's Settings → Train
tab (`components/VoiceProfileForm.tsx` — fields: Niche, Tone, Examples,
Voice Style, Voice Inspiration, Custom Rules). Each has real example posts,
so `getOrBuildStyleProfile()` actually has a corpus to extract a
`StyleProfile` from — without examples, style-consistency scoring has
nothing concrete to check against.

The product only supports one voice profile per account at a time (see
`extension/CLAUDE.md`'s "Known Limitations" — no multi-profile support),
so running the full benchmark against all three personas means re-entering
the profile between passes. That's expected; note in your results which
persona was active for which batch.

Examples below are written to be internally consistent per persona (same
rhythm/punctuation/vocabulary/directness throughout) so the extracted
`StyleProfile` should converge on a clear, non-contradictory signal —
useful as a baseline. `benchmark.md` separately calls out scenarios meant
to stress conflicting or thin evidence.

---

## Persona A — "Direct builder" (technical/founder)

- **Niche:** `backend infra, developer tools`
- **Tone:** `direct, low ego, terse`
- **Voice Inspiration:** `nobody`
- **Custom Rules:** *(leave empty)*
- **Examples** (paste as-is, one per line — the form accepts newline- or
  JSON-array-separated examples):

```
shipped the migration. zero downtime. felt good to finally kill that cron job
most "best practices" are just someone's bad experience turned into a rule for everyone else
spent 3 hours debugging a timezone bug. it was always a timezone bug
we don't do standups anymore. if you need to sync that badly something else is broken
rewrote the auth layer in a weekend. should've done it 6 months ago
the best infra decision we made was doing less infra
nobody warns you that scaling a team is harder than scaling a database
cut our build time in half by deleting code, not adding tooling
```

- **Expected extracted traits** (for sanity-checking `getOrBuildStyleProfile()`'s output, not something to force): lowercase-leaning, direct/blunt, short sentences, minimal punctuation, dry/deadpan humor, no emoji, no hashtags.

---

## Persona B — "Casual / witty" (lifestyle/comedy)

- **Niche:** `lifestyle, comedy, general`
- **Tone:** `witty, self-deprecating, casual`
- **Voice Inspiration:** `nobody`
- **Custom Rules:** *(leave empty)*
- **Examples:**

```
My productivity system is just guilt with extra steps.
Told myself I'd go to bed early. It is 1am. I am reading about Roman aqueducts.
Coffee is the only relationship in my life with consistent communication.
Adulthood is just googling things you should already know how to do.
I don't have a work-life balance, I have a work-life shrug.
My calendar looks like a losing game of Tetris and I refuse to fix it.
Every group chat eventually becomes a group chat about the group chat.
I peaked emotionally the day I found the perfect parking spot.
```

- **Expected extracted traits:** standard capitalization, moderate energy, casual vocabulary, self-deprecating humor, occasional rhetorical exaggeration, no emoji (none in examples), no hashtags.

---

## Persona C — "Analytical / professional" (data, B2B)

- **Niche:** `SaaS analytics, B2B`
- **Tone:** `analytical, structured, credible`
- **Voice Inspiration:** `nobody`
- **Custom Rules:** `Back up claims with a number or concrete detail when possible.`
- **Examples:**

```
We reduced churn by 12% in Q2 by fixing onboarding, not by adding features.
Most dashboards fail because they answer questions nobody asked. Start with the decision, then pick the metric.
A/B tested our pricing page for 6 weeks. The winning change was removing a field, not adding one.
Retention is a lagging indicator. If you're only watching it, you're already behind.
We stopped tracking vanity metrics in Q1. Nobody has missed them.
The support ticket volume told us more about product quality than the NPS score did.
Three months of data beat three hours of debate every time we tested it.
Our best growth lever this year was deleting a confusing step, not adding a new one.
```

- **Expected extracted traits:** standard capitalization, moderate-to-high confidence, sophisticated/moderate vocabulary, data-oriented rhetorical devices (numbers, contrast pairs), no emoji, no hashtags.

---

## Conflicting-evidence persona (stress test)

For the one benchmark scenario that deliberately tests thin/contradictory
style evidence (see `benchmark.md`'s `P10`/`R10`), use a **minimal, mixed**
set of examples instead of a full persona — this intentionally gives
`computeConfidenceScore()` a small corpus with inconsistent style:

```
Q3 infrastructure costs decreased materially following the migration to reserved capacity.
lmaooo just spent 4 hrs debugging a typo. we've all been there
```

Two examples only, one formal/corporate, one slangy/lowercase — this is
the same conflicting-corpus fixture already used in
`promptQuality.test.ts`'s style-profile tests. The point isn't to get a
"good" output; it's to see how the model behaves when the voice signal is
genuinely weak or contradictory.
