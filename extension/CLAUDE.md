# Aminta — Chrome Extension Context

Aminta is a Chrome side-panel extension that lives inside X (Twitter). It generates posts, replies, and polished drafts in the user's own voice, inserts them directly into the composer, and runs an XP / evolution system to reward consistent posting.

X is the only supported platform — there is no platform picker in the UI. `lib/prompts.ts`'s `Platform` type is a single-value union (`"x"`) kept only so call sites that need a `Platform` argument (buildMessages, readActivePost, insertText/insertImage) still type-check; it's never a place multi-platform branching happens anymore.

---

## Core Generation System

### Modes (`lib/prompts.ts`)
| Mode | What it does | XP awarded |
|---|---|---|
| `tweet` | Writes an original post from a topic | 50 XP |
| `reply` | Writes a reply given a tweet/post as context | 25 XP |
| `polish` | Rewrites a rough draft, keeping the user's voice | 15 XP |

### Platform
X only — 280 character limit, `contents/twitter-bridge.ts`.

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
- Awarded on **Insert** (not on Generate) to incentivise publishing. If direct
  insert fails (e.g. wrong tab), the clipboard fallback still awards XP —
  the user is never locked out of progression
- Each generated text is hashed — same post can only award XP once (`earnedHashes[]`)
- Daily cap: **500 XP per day**
- All "today" logic (cap, streak, missions, free limit) uses **local calendar
  dates** via `lib/dates.ts` — never `toISOString()` (UTC)
- XP is stored locally in `chrome.storage.local` and synced to cloud after each award
- First-ever XP award triggers a "First Post" celebration modal (same component
  as level-up, `firstPost` flag on `LevelUpData`)

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
- Auth via the landing page (`amintaapp.com/login` — Google, GitHub, or email OTP)
- Tokens stored in `chrome.storage.local` as `auth_access_token`, `auth_refresh_token`, `auth_user_id`, `auth_user_email`
- **Token refresh**: on any 401, `sync.ts` calls `refreshAuthSession()` →
  `POST amintaapp.com/api/auth/refresh` and retries once. A definitively dead
  refresh token clears the session (sidepanel flips to LoginScreen); network
  errors keep the session
- Sync writes status to storage (`sync_status`: ok / offline / error /
  signed_out, plus `sync_last_push` / `sync_last_pull` / `sync_last_error`) —
  shown in Settings → Account. Sync must never fail silently
- Cloud/local merge: XP = max, `earnedHashes` = set union, streak follows the
  side with the newer `streakDate`
- After every XP award: `pushToCloud()`; voice profile is also pushed when
  onboarding completes
- **Cross-account isolation**: `chrome.storage.local` is one global bucket
  shared by every signed-in user on the device — it is NOT scoped per
  account. `lib/accountScope.ts → handleAuthUserChanged(previousUserId,
  nextUserId)` is the only place allowed to clear account-scoped state
  (`storage.ts → ACCOUNT_SCOPED_KEYS`, i.e. everything except `apiKey`/
  `model`) before a cloud pull. It's wired into `background.ts`'s
  `chrome.storage.local.onChanged` listener (authoritative — has real
  `oldValue`/`newValue` even if the sidepanel is closed) and mirrored in
  `sidepanel.tsx`'s own listener. Never call `pullFromCloud()` directly in
  response to `auth_user_id` changing — its merge (`Math.max` against local
  XP) will silently resurrect a previous account's XP/streak/voice profile
  onto a different user if the local cache wasn't cleared first
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
- **Thread mode** — multi-tweet thread generation is listed as "coming soon" in pricing but not implemented.
- **Multiple Amintas** — one voice profile per account; multi-profile support not built.
- **Saved content** — no draft/history storage.
- **Streak insurance / freeze** — marketed on Pro tier but not implemented.
- **Advanced voice controls** — coming soon placeholder.
