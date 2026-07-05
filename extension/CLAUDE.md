# Aminta — Chrome Extension Context

Aminta is a Chrome side-panel extension that lives inside X (Twitter) and LinkedIn. It generates posts, replies, and polished drafts in the user's own voice, inserts them directly into the composer, and runs an XP / evolution system to reward consistent posting.

---

## Core Generation System

### Modes (`lib/prompts.ts`)
| Mode | What it does | XP awarded |
|---|---|---|
| `tweet` | Writes an original post from a topic | 50 XP |
| `reply` | Writes a reply given a tweet/post as context | 25 XP |
| `polish` | Rewrites a rough draft, keeping the user's voice | 15 XP |

### Platforms
| Platform | Character limit | Content script |
|---|---|---|
| `x` | 280 | `contents/twitter-bridge.ts` |
| `linkedin` | 3000 | `contents/linkedin-bridge.ts` |
| `threads` | 500 | (no inject — clipboard fallback) |

### Tones
`direct` · `witty` · `analytical` · `inspiring`

Each tone appends a short instruction to the system prompt. The user selects tone per-generation in the UI.

### Voice Profile (`lib/storage.ts → VoiceProfile`)
Stored locally. Fields:
- `niche` — e.g. "AI, B2B SaaS"
- `tone` — e.g. "direct, no fluff"
- `examples` — newline-separated example posts the user has written
- `voiceStyle` — freeform style notes
- `voiceInspiration` — a creator handle to style-match (optional)
- `customRules` — extra instructions injected verbatim into every prompt

Tweet DNA (`store.tweetDNA: string[]`) — additional writing samples imported separately (up to N tweets). Combined with voice.examples in the system prompt.

---

## AI Providers (`lib/ai.ts`)

API key prefix determines provider — **no provider selection needed from the user**:

| Key prefix | Provider | Default model |
|---|---|---|
| `AIza…` or `AQ.…` | Google AI Studio (Gemini) | `gemini-2.0-flash` |
| `gsk_…` | Groq (free tier) | `gpt-oss-120b` |
| anything else | OpenRouter | user-selected model |

Vision (image-to-text) is supported on Gemini and OpenRouter. **Groq does not support vision** — throws a user-facing error if attempted.

---

## XP & Evolution (`lib/xp.ts`, `lib/evolution.ts`)

### XP rules
- Awarded on **Insert** (not on Generate) to incentivise publishing
- Each generated text is hashed — same post can only award XP once (`earnedHashes[]`)
- Daily cap: **500 XP per day**
- XP is stored locally in `chrome.storage.local` and synced to cloud after each award

### Evolution levels
10 levels. Level 1 costs 300 XP; each subsequent level costs ~1.5× more (exponential curve).

Cumulative XP thresholds (`LEVEL_THRESHOLDS`):
| Level | Total XP needed | XP to advance |
|---|---|---|
| 1 | 0 | 300 |
| 2 | 300 | 450 |
| 3 | 750 | 650 |
| 4 | 1400 | 900 |
| 5 | 2300 | 1200 |
| 6 | 3500 | 1700 |
| 7 | 5200 | 2300 |
| 8 | 7500 | 3000 |
| 9 | 10500 | 4000 |
| 10 | 14500 | — |

At the 500 XP/day cap, reaching max takes ~29 days.

Named forms:

| Level | Name | Stage | Color |
|---|---|---|---|
| 1 | Dormant | Egg | #74f7b5 (mint) |
| 2 | Curious | Imp | #3fe0c8 (cyan) |
| 3 | Happy | Familiar | #38c0ff (blue) |
| 4 | Excited | — | #6a8cff |
| 5 | Mischievous | Guardian | #a96cff |
| 6 | Confident | — | #d65cff |
| 7 | Guardian *(hidden)* | Ancient | #ff5cc4 |
| 8 | Mythic *(hidden)* | — | #ff5c7a |
| 9 | Ascended *(hidden)* | — | #ff4d4d (red) |

Levels 7-9 are `revealed: false` — name is shown as "a new form" in the UI until reached.

---

## Streak System (`lib/missions.ts → recordStreak`)
- A streak increments if the user posts on consecutive calendar days
- Miss a day → streak resets to 1 on next post
- Streak is stored as `streak` + `streakDate` in local storage
- **No XP is awarded for streaks directly** — streak is a display mechanic only

---

## Daily Missions (`lib/missions.ts`)
Reset every calendar day. All three must be met to claim **+150 XP** (once per day):
1. Generate at least **3 times**
2. **Publish** (Insert) at least **1 post**
3. Have at least **3 voice samples** (examples + DNA combined)

---

## Training Quest (`lib/missions.ts → tryCompleteTrainingQuest`)
One-time reward of **+200 XP** when the user completes all 4:
1. Add niche
2. Add an inspiration account
3. Add custom rules
4. Add 10+ DNA tweets

---

## Content Scripts

### `contents/twitter-bridge.ts`
- Runs on `x.com/*` and `twitter.com/*`
- Injects **⚄ Generate** and **+ Polish** buttons into every X compose bar (modal AND sidebar)
- `findTextAreaWrapper(bar?)` — scoped lookup from the bar's parent to avoid targeting the wrong textarea when multiple compose boxes are open simultaneously
- `insertIntoComposer(text, bar?)` — uses `document.execCommand("insertText")` to inject into X's React contenteditable
- `insertImageIntoComposer(dataUrl)` — tries X's hidden file input first, falls back to synthetic paste event
- Sends `AMINTA_INSERT` / `AMINTA_GENERATE` messages to the side panel via `chrome.runtime`

### `contents/linkedin-bridge.ts`
- Runs on `linkedin.com/*`
- Detects the active post in the feed for Reply mode (read-only context scraping)
- Tracks `lastEditor` (the focused contenteditable) for future Insert support
- **Insert into LinkedIn is not yet implemented** — falls back to clipboard copy on Insert

---

## Storage (`lib/storage.ts`)
Everything lives in `chrome.storage.local`. No server-side user data for generation.

Key fields:
```
apiKey          — BYOK AI key
model           — selected model string
voice           — VoiceProfile | null
tweetDNA        — string[] (imported writing samples)
xp              — cumulative XP
generationsTotal — lifetime generate count
earnedHashes    — string[] (dedup XP per post)
xpToday         — XP earned today
xpTodayDate     — ISO date string
streak          — current streak count
streakDate      — last streak date
missionDate     — current mission day
missionGenerates — generates today
missionPublished — inserts today
bounties        — Bounty[] (user-submitted posts for review)
onboardingDone  — boolean
```

---

## Auth & Sync (`lib/auth.ts`, `lib/sync.ts`)
- Auth via Google OAuth on the landing page (`amintaapp.com/login`)
- Tokens stored in `chrome.storage.local` as `auth_access_token`, `auth_refresh_token`, `auth_user_id`, `auth_user_email`
- After every XP award: `pushToCloud()` syncs XP, streak, missions, voice profile to `amintaapp.com/api/sync`
- **Generation itself is never sent to Aminta's servers** — requests go directly from the browser to the user's AI provider

---

## Key Components

| File | Role |
|---|---|
| `sidepanel.tsx` | Root — auth gate, tab switcher (Home / Create / Train), level-up modal |
| `components/GeneratorPanel.tsx` | Mode/platform/tone picker, context textarea, Generate button, disabled-state hints |
| `components/OutputCard.tsx` | Shows generated text, Copy + Insert buttons, XP feedback, clipboard fallback |
| `components/VoiceProfileForm.tsx` | Train tab — voice fields + DNA tweet importer |
| `components/HomeTab.tsx` | Home tab — XP progress, streak, daily missions, training quest |
| `components/EvolutionsTab.tsx` | Evolve tab — all 9 forms grid |
| `components/OnboardingWizard.tsx` | First-run wizard (shown when `onboardingDone === false`) |
| `components/ApiKeyForm.tsx` | Settings overlay — API key + model picker |
| `lib/prompts.ts` | All system + user prompts for every platform × mode |
| `lib/ai.ts` | Provider router (Gemini / Groq / OpenRouter) |
| `lib/evolution.ts` | Level/form/tint calculations |
| `lib/xp.ts` | XP award, hash dedup, daily cap |
| `lib/missions.ts` | Streak, daily missions, training quest, DNA strength |

---

## Known Limitations / Not Yet Built
- **LinkedIn Insert** — content script can read context but cannot inject text into LinkedIn's composer. Currently falls back to clipboard copy.
- **Threads** — no content script; Threads platform uses clipboard fallback only.
- **Thread mode** — multi-tweet thread generation is listed as "coming soon" in pricing but not implemented.
- **Multiple Amintas** — one voice profile per account; multi-profile support not built.
- **Saved content** — no draft/history storage.
- **Streak insurance / freeze** — marketed on Pro tier but not implemented.
- **Advanced voice controls** — coming soon placeholder.
