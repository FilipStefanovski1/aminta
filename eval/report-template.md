# Generation Quality Evaluation Report

*Fill in once real outputs from `benchmark.md` have been pasted back and
scored against `scoring-rubric.md` / tagged against
`failure-taxonomy.md`. Every claim below must cite a specific scenario ID
and quote the actual output — no scores or conclusions without evidence
this report can be checked against.*

**Run date:** _____
**Provider(s) used:** _____ (Gemini BYOK / Groq BYOK / OpenRouter BYOK / Included AI)
**Personas used:** _____
**Scenarios completed:** ___ / 35

---

## 1. Scored results

One block per scenario, using `scoring-rubric.md`'s recording format.
Organize by mode.

### Post (P01–P10)
*(9 score lines + failure tags each, per scoring-rubric.md's format)*

### Reply (R01–R10, R01-short)

### Polish (PL01–PL05)

### Image-aware reply (IR01–IR05)

### Template-generate (T01–T05)

### Provider comparison (if run)

---

## 2. Recurring failure patterns

Pull from the failure-tag counts across section 1. Table format:

| Tag | Count / 35 | Scenarios | Notes |
|---|---|---|---|
| e.g. `GENERIC-AGREEMENT` | ?/10 replies | R02, R05, ... | ... |

Only patterns appearing in **3 or more** scenarios count as "recurring" —
anything rarer gets mentioned in evidence but not treated as a systemic
issue.

---

## 3. Mode comparison

For each mode (post / reply / polish / image reply / template), state:
- Average score per dimension (not just the bottom-line — a mode can be
  natural but irrelevant, or relevant but robotic).
- Best-performing scenario (ID + why).
- Worst-performing scenario (ID + why).
- Which mode is strongest overall and which is weakest, with the specific
  evidence (not "post generation feels stronger" — "P03 and P06 both
  scored 8+ on originality because X; R02 and R05 both scored ≤4 on
  conversational quality because Y").

---

## 4. Provider comparison

*(Skip this section if no provider comparison was run.)*

For each of the 5–8 scenarios run across providers, a side-by-side:

| ID | Gemini output | Groq output | Included AI output | Notable difference |
|---|---|---|---|---|
| P01 | ... | ... | ... | ... |

Summarize whether the same prompt produces meaningfully different quality
across providers, and if so, in which dimension specifically.

---

## 5. Evidence chains for every real issue found

One block per distinct issue (not per scenario — if the same root cause
shows up in 5 scenarios, one evidence chain covering all 5 is better than
5 near-identical ones). Required structure, per the evaluation brief:

```
### Issue: <short name>
**Input(s):** <scenario ID(s) and the exact input used>
**Generated output(s):** "<verbatim>"
**Why it's weak:** <specific, tied to the rubric dimension(s) it hurt>
**Root cause:** <the actual mechanism — a missing prompt instruction, a
  contradicting instruction, missing context the prompt never had access
  to, or a provider-level limitation — not a guess>
**Specific improvement:** <only if the evidence justifies a change; if the
  root cause is missing context rather than a prompt problem, say so
  explicitly instead of proposing a prompt fix>
```

---

## 6. Prompt waste found

Instructions in `extension/lib/prompts.ts` / `landing/lib/ai/prompts.ts`
whose presence or absence made no observable difference across the batch,
or that appear to conflict with each other in practice (not just in
theory). Only list something here if the real outputs actually support it
— e.g. "the em-dash rule had no observable effect: N outputs used an em
dash despite no persona example containing one" is evidence; "the em-dash
rule seems unnecessary" is not.

| Instruction | Evidence it's not helping / is conflicting | Scenarios |
|---|---|---|

---

## 7. Missing context found

Whether quality is bottlenecked by the *prompt* or by information the
prompt never had access to in the first place — per the brief, this takes
priority over prompt tweaks. Check each of:

- **Source tweet context** — was `IGNORES-REQUEST`/`FACTUAL-ASSUMPTION`
  ever caused by the reply prompt only seeing raw text with no quoted-post
  or thread context?
- **Voice profile strength** — did `WEAK-VOICE` scenarios (P10, R10) score
  meaningfully worse on style consistency than full-persona scenarios? If
  so, by how much, concretely?
- **Author history** — would knowing anything about who posted the source
  tweet have changed what a good reply looks like, based on any of the
  R0x scenarios?
- **Conversation history** — for any reply scenario, would the immediately
  preceding reply in the thread (if any) have changed the ideal response?
- **Image information** — for IR01–IR05, did `IMAGE-HALLUCINATION` or a
  low relevance score trace to the model getting too little visual detail
  (e.g. `detail: "low"` in the vision request — see
  `extension/lib/ai.ts`'s `generateFromImage()`), or to the image genuinely
  having nothing useful to say?
- **User intent** — for template-generate scenarios, did the model
  misjudge what "one benefit" or "a soft CTA" meant in T01–T05, in a way
  more context (not more instruction) would have fixed?

---

## 8. Final summary

### Strengths
*(cite scenario IDs)*

### Weaknesses
*(cite scenario IDs)*

### Recurring failure patterns
*(pull from section 2)*

### Unnecessary prompt complexity
*(pull from section 6 — only if evidence supports it)*

### Highest-impact improvements
*(ranked; each must trace to a specific evidence chain in section 5)*

### Changes made (if any)
*(per the brief: only if the same root cause repeats across multiple
scenarios — cite which ones — and the change is the smallest possible fix,
not a rewrite)*

### Before / after examples
*(only if a change was made)*

### Verification
*(extension tsc, landing tsc, full test suite, both builds — same as every
prior prompt-change pass, only if a change was made)*
