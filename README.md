# POPPYX

Monorepo for **Ghosti2** — an AI writing assistant for X/Twitter.

Two independent apps, each with its own dependencies and config. They do **not**
share a `node_modules`, a build pipeline, or tooling.

```
POPPYX/
├── extension/   → Chrome extension (Plasmo + React + TS + Tailwind v3)
├── landing/     → Marketing website (Next.js App Router + TS + Tailwind v4)
└── README.md
```

---

## `/extension` — Chrome extension

The product. A Chrome **side panel** that generates tweets, replies, and polished
drafts in your voice, and inserts them into X's composer. BYOK — auto-detects
Groq (`gsk_…`), Google Gemini (`AIza…`/`AQ.…`), or OpenRouter (`sk-or-…`) by key prefix.

**Run it:**

```bash
cd extension
npm install
npm run dev
```

Then load it in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right)
3. **Load unpacked** → select `extension/build/chrome-mv3-dev`
4. Pin the icon and click it to open the side panel

**Production build:** `npm run build` → output in `extension/build/chrome-mv3-prod`.

---

## `/landing` — Marketing website

The public site. Standard Next.js App Router app.

**Run it:**

```bash
cd landing
npm install        # already installed by scaffold
npm run dev        # http://localhost:3000
```

**Production:** `npm run build && npm start`.

---

## Working on both

They're separate apps — open two terminals:

```bash
# terminal 1
cd extension && npm run dev

# terminal 2
cd landing && npm run dev
```

Never run `npm install` at the repo root — there is no root `package.json` by design.
Install inside `extension/` or `landing/`.
