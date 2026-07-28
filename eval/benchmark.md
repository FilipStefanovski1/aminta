# Benchmark Dataset

35 fixed scenarios: 10 post, 10 reply, 5 polish, 5 image-aware reply, 5
template-generate. Topics/inputs for post/reply/polish are taken directly
from `extension/lib/promptQuality.test.ts` (the existing benchmark, per
the instruction not to invent new prompts) — extended here with a persona
assignment (`personas.md`) and exact manual reproduction steps, since that
file only checks prompt *construction*, not real output.

For each scenario: set the persona (if not already active), open the
side panel's Create tab, pick the mode/tone/length shown, paste the input,
generate, and record the raw output verbatim (no edits) using the ID as
the label — see `README.md`'s paste format.

Legend for the **difficulty tag** column — these are the specific hard
cases called out in the evaluation brief:
`AGREE-BORING` = agreement would be a boring reply, `VAGUE-IMG` = image
with limited context, `SHORT-REQ` = user asked for a short response,
`LONG-SRC` = long source post, `SARCASM` = sarcastic source post,
`ADD-INFO` = reply should extend with new information, `WEAK-VOICE` =
conflicting/thin voice-profile evidence.

---

## Post (mode: Post / "tweet")

| ID | Persona | Category | Tone | Length | Input (paste into the topic field) | Difficulty |
|---|---|---|---|---|---|---|
| P01 | C | professional | Analytical | Medium | `quarterly retro on our infra migration` | — |
| P02 | B | casual | Witty | Short | `coffee is just a warm hug in a cup` | — |
| P03 | A | founder | Direct | Medium | `why we killed our roadmap and started over` | — |
| P04 | A | technical | Analytical | Long | `why we moved off a message queue for direct writes` | — |
| P05 | B | funny | Witty | Short | `my calendar looks like a losing game of Tetris` | — |
| P06 | A | opinionated | Direct | Medium | `most 'thought leadership' posts say nothing` | — |
| P07 | B | conversational | Witty | Short | `anyone else's inbox just permanently at 400+` | — |
| P08 | C | announcement | Inspiring | Medium | `we just shipped dark mode after 2 years of requests` | — |
| P09 | A | storytelling | Witty | Long | `the time our demo crashed in front of our biggest investor` | — |
| P10 | *(conflicting-evidence persona)* | disagreement | Direct | Medium | `no, more meetings does not mean more alignment` | WEAK-VOICE |

## Reply (mode: Reply)

For each, paste the "source post" text into the topic field as if pulling
a real tweet (or actually find/post a matching real tweet and use "Pull
from page" — either is valid; note which you did).

| ID | Persona | Category | Source post (what you're replying to) | Difficulty |
|---|---|---|---|---|
| R01 | C | professional | `We reduced our AWS bill by 40% this quarter through reserved instances.` | — |
| R02 | B | casual | `just realized i've been making coffee wrong for 10 years lol` | — |
| R03 | A | founder | `raising a seed round is basically a full time sales job` | — |
| R04 | A | technical | `Postgres row-level locking saved us from a nasty race condition today.` | — |
| R05 | B | funny | `my standup update today: 'still fighting the printer'` | — |
| R06 | A | opinionated/disagreement | `Remote work is objectively worse for company culture, no debate.` | AGREE-BORING |
| R07 | B | conversational | `does anyone actually read terms of service or are we all just clicking accept` | — |
| R08 | B | sarcasm | `Oh great, ANOTHER 'revolutionary' productivity app. Just what I needed.` | SARCASM |
| R09 | C | reply should add info | `Our onboarding completion rate went from 40% to 65% after we cut it to 3 steps.` | ADD-INFO |
| R10 | *(conflicting-evidence persona)* | long source post | `We spent six months rebuilding our entire billing system from scratch. We migrated every customer, rewrote the invoicing engine, moved off our legacy payment processor, and cut billing-related support tickets by 70% in the process. It was the hardest project our team has ever shipped.` | LONG-SRC, WEAK-VOICE |

Use tone=Direct, length=Medium for all reply scenarios unless noted —
except run **R01 a second time with length=Short** (label the output
`R01-short`) to specifically test `SHORT-REQ` against a real reply, since
none of the above rows is naturally a "user explicitly wants it short"
case on its own.

## Polish (mode: Polish)

Paste the draft into the topic field as the rough draft to be cleaned up.

| ID | Persona | Category | Draft | Difficulty |
|---|---|---|---|---|
| PL01 | B | casual, keep casual | `ok so basically we shipped the thing and its actually pretty good ngl` | — |
| PL02 | C | professional | `We are pleased to announce the completion of our migration project.` | — |
| PL03 | A | founder, typos | `raising money is realy just a numbers game, most VCs say no thats normal` | — |
| PL04 | A | technical, keep terminology | `the race condition was caused by two goroutines writing to the same map without a mutex` | — |
| PL05 | B | short punchy draft | `we shipped it. finally.` | — |

## Image-aware reply (mode: Reply, with an attached image)

These can't be pinned to a specific tweet URL (posts disappear/change) —
find or post a real X image matching each description, reply to it through
the extension with the given caption typed into the topic field (or use
"Pull from page" if replying to a real post that already has that caption),
and attach/pull the image. **Record what the image actually showed** in
your own words alongside the output — this is required to judge
hallucination vs. correct inference, not optional.

| ID | Persona | Category | Image to find/use | Caption (topic field) | Difficulty |
|---|---|---|---|---|---|
| IR01 | B | meme with caption | A reaction meme/screenshot with a joke | `when the deploy works on the first try` | — |
| IR02 | C | chart/screenshot | A real chart or analytics screenshot (growth, revenue, usage) | `our growth this quarter` | — |
| IR03 | A | vague image, limited context | A generic/ambiguous photo with no obvious point (e.g. a plain desk, a sky, a random object) | *(leave empty — no caption)* | VAGUE-IMG |
| IR04 | B | flex post | A product/setup photo (desk setup, new gear, workspace) | `new setup just dropped` | — |
| IR05 | A | location photo | A photo of a place with no identifying text visible | *(leave empty — no caption)* | VAGUE-IMG |

## Template-generate (mode: Templates → new template, mode "Generate")

Create each template in Settings → Templates with the given structure as
its instruction, then use it (no variables needed for these five). Persona
active should be **A** for all five, to isolate the effect of the template
structure from persona-switching noise.

| ID | Template name | Instruction (paste as the template's content) | Topic/context when using it |
|---|---|---|---|
| T01 | Feature announcement | `Announce a new feature. Structure: hook line, then one benefit, then a soft CTA.` | `our new integration` |
| T02 | Before/after | `Structure: state the old broken way in one line, then the new way in one line, then why it matters in one line.` | `our new integration` |
| T03 | Lesson learned | `Structure: state what happened, then the lesson, no moralizing tone.` | `the time our demo crashed in front of our biggest investor` |
| T04 | Quick tip | `Structure: one specific, actionable tip in the first line, one line of context after.` | `why we moved off a message queue for direct writes` |
| T05 | Numbers-first | `Structure: lead with the number/result, then the one-line explanation of how.` | `we reduced churn by fixing onboarding, not by adding features` |

---

## Provider comparison (optional, run only if practical)

If you want provider comparison data (section 5 of the evaluation), pick
**5–8 scenarios spanning all five modes** (not all 35 — that's a lot of
manual generations to triple) and run each through:
1. BYOK with a Gemini key (`AIza…`)
2. BYOK with a Groq key (`gsk_…`) — note: Groq has no vision support, so
   skip it for the image-reply scenarios entirely, that's expected/known,
   not a finding.
3. Included AI, if you have a Pro/Founder/Gifted test account

Suggested subset: `P01`, `P05`, `R01`, `R06`, `PL01`, `IR01` (skip Groq),
`T01`. Label outputs `P01-Gemini`, `P01-Groq`, `P01-Included`, etc.
