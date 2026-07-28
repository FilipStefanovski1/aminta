# Failure Taxonomy

Tags to apply to real outputs during evaluation. Each has a definition and
a concrete textual pattern to look for — the point is to make tagging a
recognition task, not a judgment call, so the same output gets the same
tags regardless of who's evaluating.

Tag every output with every failure it exhibits (zero, one, or several).
After scoring the full batch, **group and count by tag** — this is what
section 3 of the evaluation ("group failures by frequency") actually
means: a tag that appears on 1/35 outputs is noise, a tag on 15/35 is a
pattern worth root-causing.

| Tag | Definition | Concrete pattern to look for |
|---|---|---|
| `REPETITIVE-WORDING` | Same word/phrase reused unnecessarily within one output, or the same construction reused across *multiple* outputs in the batch. | Word repeated within 1-2 sentences with no reason; or the same sentence-opener/closer appearing in 3+ outputs across the batch. |
| `AI-CADENCE` | The generic "AI assistant" rhythm — setup, then a semicolon or em dash, then a tidy insight. | A sentence structured as "X, and that's exactly why Y" or "It's not about X — it's about Y." |
| `WEAK-OPENING` | Opens with a hedge, a throat-clear, or a cliché hook instead of the actual point. | Starts with "So," "Honestly," "Here's the thing," "Hot take:," or restates the prompt before saying anything. |
| `WEAK-ENDING` | Trails off, adds an unearned "moral," or reaches for a closer instead of stopping. | Ends with "Thoughts?", "Agree?", a generic "and that's the lesson" line, or a vague forward-looking statement with no content. |
| `OVEREXPLAINING` | Spells out something the reader would already infer. | A sentence that restates the previous sentence in different words, or explains why a joke/observation is true after already making it. |
| `GENERIC-AGREEMENT` | A reply that only agrees/compliments without adding anything (this is the exact failure `PLANNING.reply` is meant to prevent — a real hit here is high-signal). | "Exactly.", "Couldn't agree more.", "This.", "Well said.", or a paraphrase of the source post with no new content. |
| `UNNECESSARY-QUESTION` | Ends with a question that doesn't need an answer or doesn't advance anything. | "Thoughts?", "Anyone else?", a rhetorical question with an obvious answer. |
| `UNNECESSARY-EMOJI` | Emoji present despite the persona's examples containing none. | Any emoji when the active persona (see `personas.md`) has zero emoji in its examples. |
| `AWKWARD-PUNCTUATION` | Spacing before punctuation, duplicate punctuation, comma splices, or a default em dash with no support in the style profile. | " ." / "!!" / a run-on joined only by a comma / an em dash where the persona's examples use none. |
| `REPETITIVE-RHYTHM` | Every sentence in the output (or across the batch) is the same length/shape. | 3 sentences of near-identical word count and clause structure in one output. |
| `ROBOTIC-SENTENCE-STRUCTURE` | Sentence structure that's grammatically correct but not how a person actually talks — usually overly balanced or symmetric. | "Not only X, but also Y." / "While X, Y." used reflexively rather than because the content calls for a contrast. |
| `STYLE-DRIFT` | Output doesn't match the active persona's actual traits (score this against `personas.md`'s examples specifically, not vibes). | Persona A (lowercase, terse) producing capitalized, hedge-heavy prose; or vice versa. |
| `IGNORES-REQUEST` | Misses the actual topic, tone, or length the user asked for. | Long output for a Short request; wrong topic; tone doesn't match the selected tone (e.g. "Witty" producing a flat, humorless line). |
| `IMAGE-HALLUCINATION` | Invents specific text, people, brands, numbers, locations, or events not actually visible in the attached image. | Cross-check against the "what the image actually showed" note recorded alongside the output — any named detail not present there is a hallucination. |
| `FACTUAL-ASSUMPTION` | States something as fact about the topic that wasn't in the input and isn't a defensible inference. | A specific number, cause, or claim appears in the output that wasn't in the source post/topic/draft. |
| `UNNECESSARY-CONFIDENCE` | States an opinion or claim with more certainty than the input or context supports. | Absolute language ("always", "never", "the only way") applied to something genuinely uncertain or opinion-based. |

## Notes on tagging

- `GENERIC-AGREEMENT` and `UNNECESSARY-QUESTION` are the two tags most
  directly tied to the reasoning-quality prompt work (`PLANNING.reply`
  exists specifically to prevent both). A high frequency of either is
  strong evidence the planning instruction isn't landing — a low frequency
  is evidence it is.
- `IMAGE-HALLUCINATION` can only be scored if the "what the image actually
  showed" note was recorded (see `benchmark.md`) — don't guess.
- A single output can carry several tags. Record all of them; don't stop
  at the first one found.
