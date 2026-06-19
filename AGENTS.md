# AGENTS.md — Aminta Single Source of Truth

---

# PRODUCT

**Name:** Aminta

**One sentence:**
A pixel-art AI companion that grows stronger as you post.

**Core loop:**
```
Write
→ Generate
→ Post
→ Earn XP
→ Feed Aminta
→ Level Up
→ Unlock evolutions
→ Post again
```

**Platform:** Chrome Extension (side panel) + Next.js landing page
**Live on:** X (Twitter). LinkedIn and Reddit planned.
**Business model:** Free (BYOK) / Pro $9/mo / Founder $49 lifetime

---

# PRODUCT PRINCIPLES

## 1. Aminta is the product. The AI is a feature.

The emotional core is the relationship between user and Aminta.
Generation is what gets users to open the panel.
The companion is what gets them to come back.

## 2. Everything reinforces the relationship with Aminta.

Before adding anything, ask: does this make Aminta feel more alive?
Does this make the user feel like they're feeding something that matters?
If no — don't build it.

## 3. Every screen must answer: "How does this help Aminta grow?"

If a screen cannot answer that question, it is a configuration screen.
Configuration screens are secondary. They should never be the primary experience.

## 4. Never build generic SaaS UI.

No Notion-style docs. No Linear-style issue boards. No admin panels.
No feature tables. No enterprise onboarding patterns.

## 5. Prioritize game vocabulary over SaaS vocabulary.

| Use this | Not this |
|----------|----------|
| Feed | Usage |
| XP | Credits |
| Level up | Upgrade |
| Evolution | New version |
| Hungry | Inactive |
| Streak | Retention |
| DNA | Training data |
| Aminta | The AI |

## 6. Every action should feel rewarded.

No dead ends. No empty states without direction. No confirmations without celebration.

## 7. Design for daily ritual, not one-time use.

The user should feel something when they miss a day.
The user should feel something when they post.
The user should feel something when Aminta levels up.

---

# VISUAL LANGUAGE

## Theme
Retro pixel RPG companion. Tamagotchi meets browser extension.

## Keywords
- playful, alive, companion, game, progression, nostalgic

## Avoid
- corporate, enterprise, sterile, dashboard-heavy, AI-generated feeling

## Colors (exact values — do not deviate)

### Extension (Tailwind v3 + CSS variables)
```css
--mint:    #74f7b5   /* primary accent — XP, levels, success */
--charcoal: #0d0d0f  /* background */
--panel:   #111318   /* card background */
--border:  #1e2028   /* dividers */
```

### Landing (Tailwind v4 CSS variables)
```css
--color-ink:   #1f1f1f  /* page background */
--color-panel: #242424  /* card surface */
--color-line:  #343438  /* dividers */
--color-muted: #9a9aa3  /* secondary text */
--accent:      #74f7b5  /* default — changes with scroll stage */
```

### Accent stages (scroll-driven on landing, used in evolution grid)
| Stage | Color | When |
|-------|-------|------|
| Dormant | `#74a090` | Default / Lv.1 |
| Curious | `#74f7b5` | Lv.2 |
| Happy | `#40e898` | Lv.3 |
| Excited | `#00c8a8` | Lv.4 |
| Mischievous | `#00e0c0` | Lv.5 |

## Typography

### Extension
- **Press Start 2P** — labels, headings, XP values, tab names
  - Applied via `.font-pixel` class
  - Sizes: 7px (labels), 8–10px (UI), 11px (headings)
- **System font** — body copy, form inputs, textarea content

### Landing
- **Press Start 2P** — same usage via `--font-pixel` variable
- **Geist** — body copy via `--font-geist` variable

## Component styling

### Extension buttons
```css
.btn-pixel {
  border: 3px solid #000;
  box-shadow: 3px 3px 0 #000;
  font-family: 'Press Start 2P';
  font-size: 10px;
}
.btn-pixel:active {
  transform: translate(2px, 2px);
  box-shadow: 1px 1px 0 #000;
}
```

### Extension inputs
```css
.input-pixel {
  background: #0a0a0c;
  border: 2px solid #1e2028;
  color: #e7e7ef;
}
.input-pixel:focus { border-color: var(--mint); }
```

### Landing cards
- `rounded-2xl border border-line bg-panel p-6`
- Highlighted: `border-2 border-accent bg-panel shadow-[0_0_60px_rgba(116,247,181,0.10)]`

---

# MOTION

## Allowed — purposeful, alive
- Sprite float (2.8s ease-in-out infinite, ±5px Y)
- Sprite react (bounce on generate — 0.55s cubic-bezier spring)
- Sprite blink (random 3–8s intervals, 110ms close)
- Speech bubble pop-in (0.25s spring)
- XP rise (text floats up 38px, 1.1s ease, fades out)
- Tab slide-up on switch (0.22s cubic-bezier)
- Card entrance stagger (20–50ms delays per card)
- Animated XP bar (0.8s cubic-bezier sweep on mount)
- Bouncing dot loader (wave animation while generating)
- Toast slide-in (0.18s spring)
- Scroll-driven demon walk (landing only — Framer Motion)
- Level-up audio blip (Web Audio API, two-tone 330/550Hz)
- Holo sweep on RARE+ cards (landing evolution grid)

## Not allowed
- Random decorative animations with no state meaning
- Excessive Framer Motion effects in the extension
- Hover animations that play on non-interactive elements
- Animations that run on every render without a trigger
- Marquee pause on hover (cards scroll continuously like a gif)

## CSS animation classes (extension)
```
.animate-slide-up   slideUpIn     0.22s cubic-bezier(0.22,1,0.36,1)
.animate-fade-in    fadeInQ       0.15s ease
.animate-card-in    cardEnter     0.2s  cubic-bezier(0.22,1,0.36,1)
.animate-toast      toastSlide    0.18s cubic-bezier(0.34,1.56,0.64,1)
.sprite-float       spriteFloat   2.8s  ease-in-out infinite
.sprite-react       spriteReact   0.55s cubic-bezier(0.34,1.56,0.64,1)
.bubble-pop         bubblePop     0.25s cubic-bezier(0.34,1.56,0.64,1)
.xp-rise            xpRise        1.1s  ease forwards
.dot-wave           dotsWave      1.0s  ease-in-out infinite
```

---

# XP SYSTEM

## XP per action (extension — real implemented values)
| Action | XP | When awarded |
|--------|-----|--------------|
| Tweet mode → Insert into X | +50 | On successful insert only |
| Reply mode → Insert into X | +25 | On successful insert only |
| Polish mode → Insert into X | +15 | On successful insert only |
| Bounty approved (DEV) | +100 | On DEV approval |
| Bounty featured (DEV) | +250 | On DEV feature |

## XP is NOT awarded for
- Pressing Generate
- Copying text
- Opening any screen
- Clicking any button except Insert into X
- Submitting a bounty (0 XP on submission)
- Completing onboarding
- Any passive action

## XP protections
- **Hash dedup**: djb2 hash of output text stored in `earnedHashes[]`. Same output → 0 XP.
- **Daily cap**: 500 XP/day. Resets at midnight ISO date.
- **Messages**: "XP already claimed for this post." / "Daily XP limit reached. Come back tomorrow."

## Level system (extension — real implemented values)
```
XP per level: 300
Max level: 10

Lv.1  Dormant      (0–299 XP)
Lv.2  Awakened     (300–599 XP)
Lv.3  Curious      (600–899 XP)
Lv.4  Restless     (900–1199 XP)
Lv.5  Mischievous  (1200–1499 XP)
Lv.6  Sharp        (1500–1799 XP)
Lv.7  Relentless   (1800–2099 XP)
Lv.8  Feared       (2100–2399 XP)
Lv.9  Mythic       (2400–2699 XP)
Lv.10 Legendary    (2700+ XP)
```

Sprite tint changes at Lv.3 (cyan), Lv.5 (mint), Lv.8 (pink).

## Evolution grid (landing — 9 stages)
```
Lv.1  Dormant Aminta     COMMON     #8ca0b0
Lv.2  Curious Aminta     COMMON     #74f7b5
Lv.3  Happy Aminta       UNCOMMON   #40e898
Lv.4  Excited Aminta     UNCOMMON   #00c8a8
Lv.5  Mischievous Aminta UNCOMMON   #00e0c0
Lv.6  Confident Aminta   RARE       #40b0ff
Lv.7  Guardian Aminta    EPIC       #74f7b5  (???)
Lv.8  Mythic Aminta      EPIC       #c0a0ff  (???)
Lv.9  Ascended Aminta    LEGENDARY  #f5d060  (???)
```

Lv.7–9 shown as "???" — unrevealed. Supply: 999 per form. Season 1.

**Note:** Landing evolution grid (9 stages) and extension level system (10 levels) use
different naming schemes. They need to be reconciled.

---

# AMINTA SPRITE

## Behaviors
- **Idle float**: `sprite-float` — 2.8s sinusoidal bob
- **Blink**: Random timer 3500–8000ms. Eyes close for 110ms.
- **React**: `sprite-react` — bounce + scale + rotate when generating
- **XP rise**: "+N XP" text rises above sprite, fades. Triggered by `xpTrigger` prop increment.
- **Speech bubble**: Cycles every 4.5s with pop-in animation.

## Speech bubble messages (current)
```
"feed me another post."
"good one."
"reply to that."
"keep cooking."
"one more."
"what are we posting today?"
"your timeline is hungry."
"type something real."
```

## Sprite SVG shape (16×13 viewBox)
```
Horns:  rect x2,y0 w2h3 + rect x12,y0 w2h3
Body:   rect x3,y3 w10h9
Eyes:   rect x4,y6 w2h2 + rect x10,y6 w2h2 (close on blink)
```

---

# NAVIGATION

## Extension tabs (current order)
```
Write → Voice → Bounty → Me → Settings
```

## What each tab is
| Tab | Purpose | Priority |
|-----|---------|----------|
| Write | Generate tweets/replies/polish | PRIMARY — core loop |
| Voice | Configure voice profile | SECONDARY — config |
| Bounty | Submit tweets for XP review | SECONDARY — game mechanic |
| Me | XP dashboard + level + DNA | PRIMARY — companion state |
| Settings | API key + model | UTILITY |

## Left strip
A 28px vertical column on the left edge of the panel.
Contains a small mint PROFILE button at the top (vertical text, writing-mode: vertical-rl).
Clicking opens the profile panel as a content script to the LEFT of the side panel.

---

# ONBOARDING

## Trigger
`SetupGate` wraps the entire sidepanel. If `store.onboardingDone === false`,
renders `OnboardingWizard` instead of the main UI.

## 10 steps (OnboardingWizard)
```
0  Name          — display name
1  About         — bio
2  Interests     — niche/topics
3  Voice Style   — 6 options: Casual, Direct, Witty, Raw, Motivational, Analytical
4  Inspiration   — @handle they write like
5  Aminta DNA    — TweetSwiper (15 example tweets, heart/reject)
6  Examples      — paste 3–5 of their best tweets
7  Rules         — custom writing rules
8  API Key       — Groq (free), Google, or OpenRouter
9  Finish        — confirmation + "Start Writing →"
```

## Profile panel (re-runs onboarding on existing user)
Identical 10 steps, pre-populated from store. Opens via:
- PROFILE button in left strip
- "Edit Full Profile" in Me tab
- Display name in header
Renders as `ProfileOverlay.tsx` content script on x.com, falls back to `ProfilePanel.tsx` on other pages.

## Aminta DNA (TweetSwiper)
- 15 hard-coded example tweets about building in public / X growth
- User hearts (saves) or rejects each
- Liked tweets stored in `store.tweetDNA[]`
- `onDone(liked)` callback advances wizard

---

# VOICE SYSTEM

## VoiceProfile interface
```ts
interface VoiceProfile {
  niche: string            // what they post about
  tone: string             // derived from voiceStyle or custom
  examples: string         // paste 3–5 example tweets, one per line
  voiceStyle: string       // one of 6 presets
  voiceInspiration: string // @handle or "nobody"
  customRules: string      // "Never use hashtags. No emojis."
}
```

## 6 voice style presets
`Casual` · `Direct` · `Witty` · `Raw` · `Motivational` · `Analytical`

## How voice feeds generation (prompts.ts)
```
System prompt:
- "You write posts for X as a specific person. Match their voice precisely."
- NICHE: {voice.niche}
- TONE: {voice.tone}
- THEIR EXAMPLE POSTS: {voice.examples} (split by newline)
- RULES: no hashtags unless examples use them, no emojis, under 280 chars, sound human

User prompt per mode:
- tweet:  "Write ONE original X post about: {input}"
- reply:  "Reply to: {input} in my voice"
- polish: "Rewrite my rough draft: {input} — cleaner, punchier, same meaning"
```

## Supported AI providers
| Provider | Key prefix | Free tier |
|----------|-----------|-----------|
| Groq | `gsk_` | Yes — recommended |
| Google AI Studio | `AIza` | Yes (geo-restricted) |
| OpenRouter | `sk-or-` | `:free` tier (unreliable) |

Default model: `google/gemini-flash-1.5`

---

# BOUNTY SYSTEM

## Current state: prototype
The DEV approve/reject controls are visible to the user.
There is no real community submission or review layer.
This is a mechanic placeholder that simulates what a real bounty system will be.

## Flow
1. User pastes a tweet in the Bounty tab → `status: "pending"`
2. DEV clicks approve (+100 XP) or feature (+250 XP)
3. XP is awarded once (`rewarded: true` prevents double-claim)
4. Reject sets status without XP

## XP values
| Event | XP |
|-------|-----|
| Submit | 0 |
| Approved | +100 |
| Featured | +250 |

## Storage
```ts
interface Bounty {
  id: string          // Date.now().toString(36)
  content: string     // tweet text
  status: "pending" | "approved" | "featured" | "rejected"
  createdAt: number
  rewarded: boolean   // prevents double XP
}
```

---

# STORAGE MODEL

All state lives in `chrome.storage.local`. No backend. No auth.

```ts
interface AmintaStore {
  apiKey: string           // encrypted by browser storage
  model: string            // AI model ID
  voice: VoiceProfile | null
  displayName: string
  bio: string
  interests: string
  tweetDNA: string[]       // liked tweets from TweetSwiper
  onboardingDone: boolean
  xp: number               // total all-time XP
  generationsTotal: number // increments on every tryAwardXP call
  earnedHashes: string[]   // djb2 hashes of inserted outputs
  xpToday: number          // resets daily
  xpTodayDate: string      // "YYYY-MM-DD"
  bounties: Bounty[]
}
```

---

# LANDING PAGE

## Section order (page.tsx)
```
Navbar
Hero
ThreeModes         — 4-step: idea → generate → publish → earn XP
ScrollDemonProgress — scroll-driven Aminta walk + XP bar (5 stages)
AmintaEvolutionGrid — 9 NFT-style evolution cards
Features           — 6 feature cards with XP badges
HowItWorks         — 3-step: set voice → generate → feed
MarqueeWall        — continuous testimonial scroll (no hover pause)
Pricing            — 2 cards: Free + Pro/Founder toggle
OnboardingCTA      — final CTA section
FAQ
Footer
```

## Navbar
- Fixed, hides until scroll > 10px
- Background color: mint (`#74f7b5`) by default, changes to match current scroll stage accent
- Listens to `demon-stage` CustomEvent dispatched by ScrollDemonProgress
- CTA: "Get Aminta" → `#pricing`

## Pricing
- Toggle: "Monthly" | "Lifetime −20%"
- Free plan: always visible, static
- Monthly → Aminta Pro ($9/mo, PRO badge)
- Lifetime → Founder ($49 once, LIMITED badge, Calendly link)
- Founder CTA: `https://calendly.com/filipstefanovskee/filip-stefanovski-aminta-founder`

## Footer
- Social icons: X, GitHub, LinkedIn, Instagram (all currently `href="#"` — placeholder)
- GitHub icon present (no GitHub product exists — should be removed)
- Copyright: © 2026 Aminta

---

# UX RULES

## Every screen must contain at least one of:
- Aminta's current state (level, XP, hunger, mood)
- A progression indicator
- An action that feeds Aminta
- A reward feedback

## Empty screens are forbidden.
Every empty state must:
1. Show Aminta in a dormant/hungry state
2. Explain what action feeds it
3. Include a call to action

## Dead ends are forbidden.
If a user hits an error, they see what to do next.
If a user finishes a flow, they are returned to a productive state.

## Every action should feel rewarded.
Generate → Aminta reacts visually
Insert into X → "+XP" rises above Aminta
Level up → Future: level-up burst animation
Bounty approved → Toast + XP rise

## API key gates
- If no API key: "Add your API key in Settings." (not a blocking modal)
- If no voice profile: "Complete your voice profile first." (not a blocking modal)
- These are soft errors inside the Write tab. The user can navigate freely.

---

# DESIGN AUDIT MODE

Whenever asked to change the product:

1. **Check AGENTS.md first.** Does the requested change violate a product principle?
2. **Evaluate Aminta fit.** Does it reinforce the companion relationship or is it generic SaaS?
3. **If it violates principles**, explain why and suggest a more Aminta-native solution.
4. **Read current implementation.** Never assume what the code looks like.
5. **Compare against this document.** List any inconsistencies your change might create.
6. **Only then implement.**

---

# CLAUDE WORKFLOW

## Before writing code
1. Read the relevant files. Never assume.
2. Compare against AGENTS.md.
3. List what already exists.
4. List inconsistencies between current state and AGENTS.md.
5. Propose what to change and why.
6. Wait for approval unless told to proceed immediately.

## Constraints (standing rules)
- Do not connect a backend.
- Do not add authentication.
- Do not touch AI provider logic in `lib/ai.ts`, `lib/openrouter.ts`, `lib/gemini.ts`.
- Use `chrome.storage.local` only for extension state.
- Work only inside the requested project directory.
- Do not rename working files without reason.
- Do not add abstractions for hypothetical future requirements.

## Build requirement
After any extension change, run:
```
cd /Users/filipstefanovski/POPPYX/extension && npm run build
```
Fix all TypeScript errors before reporting done.

---

# KNOWN INCONSISTENCIES (as of 2026-06-14)

These are documented gaps between the product vision and current implementation.
Do not fix them without discussion.

1. **Streak system missing**: Landing promises +100 XP daily streak. Extension has no streak implementation. `xpToday` tracks daily XP but no streak counter or break mechanic exists.

2. **Level names don't match landing**: Extension uses 10 levels (Dormant → Legendary). Landing ScrollDemonProgress uses 5 stages with different names. AmintaEvolutionGrid uses 9 stages with yet another naming scheme.

3. **DNA not used in generation**: `store.tweetDNA[]` (liked TweetSwiper tweets) is stored but not injected into prompts. `buildMessages()` uses `voice.examples` (manually typed). The two are separate.

4. **NRG/hunger system absent**: Hero mockup shows "NRG 67%". No NRG or hunger mechanic exists in the extension.

5. **Bounty is DEV-only**: There is no real community review layer. The DEV controls are user-visible — a placeholder for a future mechanic.

6. **Footer social links are all `href="#"`**: Placeholder only. Real links: `https://x.com/amintaapp`, `https://www.instagram.com/amintaapp/`, `https://www.linkedin.com/company/amintaapp/`.

7. **GitHub icon in footer**: Footer.tsx includes a GitHub social icon. No GitHub product exists for Aminta. Should be replaced with Instagram or LinkedIn.

8. **Generation limit not enforced**: Free plan says "10 generations/day" in pricing. No limit is implemented in the extension — only XP is capped.

9. **Pro features don't exist**: Thread mode, Multiple Amintas, Saved content, Advanced voice controls are listed as Pro features. None are built.

10. **TweetSwiper tweets are generic**: 15 hard-coded example tweets about X growth. Not personalized to the user's niche. Should eventually be dynamic or at least niche-aware.

11. **Onboarding has no celebration**: The finish screen (step 9) is static. No XP award, no level-up animation, no "Aminta is alive" moment.

12. **Voice tab feels like a form**: VoiceProfileForm is 5 cards with Save at the bottom. No Aminta feedback. No indication of how each field makes Aminta better. Feels like SaaS settings.

13. **AmintaSprite messages are state-blind**: Speech bubble cycles randomly. It doesn't say "I'm hungry" at low XP, "I'm thriving" at high XP, or "what happened to you?" after missing a day.

14. **FeedTheDemon.tsx is unused**: This component exists in `landing/components/` but is not imported in `page.tsx`. The page uses `ScrollDemonProgress` instead for the `#demon` section.
