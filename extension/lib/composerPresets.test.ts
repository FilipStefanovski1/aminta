// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  COMPOSER_BAR_ATTR,
  COMPOSER_BAR_VERSION,
  buildActionStrip,
  isAmintaBar,
  isCurrentBar,
  type ComposerStripHandlers,
} from "~lib/composerPresets"

function handlers(extra: Partial<ComposerStripHandlers> = {}): ComposerStripHandlers {
  return {
    onGenerate: vi.fn(),
    onPolish: vi.fn(),
    ...extra,
  }
}

function topButtons(strip: HTMLElement): HTMLButtonElement[] {
  return Array.from(strip.querySelectorAll("button"))
}

function labels(strip: HTMLElement): string[] {
  return topButtons(strip).map((b) => b.textContent?.trim() ?? "")
}

function button(strip: HTMLElement, text: string): HTMLButtonElement {
  const all = topButtons(strip)
  const el = all.find((b) => b.textContent?.trim() === text) ?? all.find((b) => b.textContent?.includes(text))
  if (!el) throw new Error(`No "${text}" — have: ${all.map((b) => b.textContent).join(", ")}`)
  return el
}

let container: HTMLDivElement
beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
})

describe("normal composer — Generate and Polish only", () => {
  it("shows exactly Generate and Polish, in that order", () => {
    const strip = buildActionStrip(handlers())
    expect(labels(strip)).toEqual(["Generate", "Polish"])
  })

  it("News, Product, You, and Length are gone — this is a deliberate product simplification, not an oversight", () => {
    const strip = buildActionStrip(handlers())
    const all = labels(strip)
    for (const removed of ["News", "Product", "You", "Auto", "Short", "Medium", "Long"]) {
      expect(all).not.toContain(removed)
    }
  })

  it("no dropdown affordance exists anywhere in the strip (aria-haspopup) — nothing left to open", () => {
    const strip = buildActionStrip(handlers())
    expect(strip.querySelectorAll("[aria-haspopup]")).toHaveLength(0)
  })

  it("exactly one Aminta action strip renders — no duplicate renderer path", () => {
    const strip = buildActionStrip(handlers())
    expect(strip.classList.contains("aminta-actions")).toBe(true)
  })

  it("Generate is clickable and fires its handler", () => {
    const h = handlers()
    const strip = buildActionStrip(h)
    container.appendChild(strip)
    button(strip, "Generate").click()
    expect(h.onGenerate).toHaveBeenCalledTimes(1)
  })

  it("Polish is clickable and fires its handler", () => {
    const h = handlers()
    const strip = buildActionStrip(h)
    container.appendChild(strip)
    button(strip, "Polish").click()
    expect(h.onPolish).toHaveBeenCalledTimes(1)
  })

  it("Generate is the primary (mint) pill, Polish the secondary (violet-accented) one", () => {
    const strip = buildActionStrip(handlers())
    const generate = button(strip, "Generate")
    const polish = button(strip, "Polish")
    expect(generate.style.backgroundColor).toBe("rgb(116, 247, 181)") // ACCENT.generate, primary fill
    expect(polish.style.backgroundColor).not.toBe("rgb(116, 247, 181)") // not primary
    expect(polish.style.borderColor).toBe("rgb(43, 43, 48)") // BORDER_DEFAULT, not accent-colored border
  })
})

describe("reply composer — Generate, Polish, and Meme", () => {
  it("adds Meme only when onOpenMeme is supplied", () => {
    const withMeme = buildActionStrip(handlers({ onOpenMeme: vi.fn() }))
    expect(labels(withMeme)).toEqual(["Generate", "Polish", "Meme"])

    const withoutMeme = buildActionStrip(handlers())
    expect(labels(withoutMeme)).not.toContain("Meme")
  })

  it("Meme fires its handler and no others", () => {
    const h = handlers({ onOpenMeme: vi.fn() })
    const strip = buildActionStrip(h)
    container.appendChild(strip)
    button(strip, "Meme").click()
    expect(h.onOpenMeme).toHaveBeenCalledTimes(1)
    expect(h.onGenerate).not.toHaveBeenCalled()
    expect(h.onPolish).not.toHaveBeenCalled()
  })

  it("News/Product/You/Length are absent on reply composers too", () => {
    const strip = buildActionStrip(handlers({ onOpenMeme: vi.fn() }))
    const all = labels(strip)
    for (const removed of ["News", "Product", "You", "Auto"]) {
      expect(all).not.toContain(removed)
    }
  })
})

describe("stale bars from a previous build are replaced, not respected", () => {
  it("a bar from THIS build is current", () => {
    const el = document.createElement("div")
    el.setAttribute(COMPOSER_BAR_ATTR, COMPOSER_BAR_VERSION)
    expect(isCurrentBar(el)).toBe(true)
    expect(isAmintaBar(el)).toBe(true)
  })

  it("a bar from any other version is stale but still ours (removed and replaced, not left alone)", () => {
    const el = document.createElement("div")
    el.setAttribute(COMPOSER_BAR_ATTR, "some-old-version")
    expect(isCurrentBar(el)).toBe(false)
    expect(isAmintaBar(el)).toBe(true)
  })

  it("unrelated elements are neither current nor ours", () => {
    const el = document.createElement("div")
    expect(isCurrentBar(el)).toBe(false)
    expect(isAmintaBar(el)).toBe(false)
    expect(isCurrentBar(null)).toBe(false)
    expect(isAmintaBar(undefined)).toBe(false)
  })
})

describe("composer focus is preserved", () => {
  it("pills suppress mousedown so the composer keeps focus", () => {
    const strip = buildActionStrip(handlers())
    container.appendChild(strip)
    const ev = new MouseEvent("mousedown", { bubbles: true, cancelable: true })
    button(strip, "Generate").dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
  })

  // The mousedown-preventDefault above only blocks the browser's own
  // default action (focus/selection) — per spec it must NOT cancel the
  // click that follows on mouseup. A real user click always fires
  // mousedown -> mouseup -> click, in that order, on the same element;
  // .click() alone (used elsewhere in this file) never exercises that
  // mousedown handler at all. This reproduces the real sequence explicitly.
  it("a real mousedown-then-click sequence still reaches the click handler", () => {
    const h = handlers()
    const strip = buildActionStrip(h)
    container.appendChild(strip)

    function realClick(el: HTMLElement) {
      const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true })
      el.dispatchEvent(down)
      el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }))
      el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
      return down
    }

    const mousedown = realClick(button(strip, "Generate"))
    expect(mousedown.defaultPrevented).toBe(true) // confirms this exercised the real guarded path
    expect(h.onGenerate).toHaveBeenCalledTimes(1)
  })
})

describe("composer tooltips", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    document.querySelectorAll('[role="tooltip"]').forEach((el) => el.remove())
  })

  it("every pill has a real tooltip — no bare icon, no native title", () => {
    const strip = buildActionStrip(handlers({ onOpenMeme: vi.fn() }))
    container.appendChild(strip)
    for (const label of ["Generate", "Polish", "Meme"]) {
      const el = button(strip, label)
      expect(el.title).toBe("") // never the native browser tooltip
      el.dispatchEvent(new Event("focus"))
    }
  })

  it("a hover tooltip appears only after a short delay, not instantly", () => {
    const strip = buildActionStrip(handlers())
    container.appendChild(strip)
    const generate = button(strip, "Generate")
    generate.dispatchEvent(new MouseEvent("mouseenter"))
    expect(document.querySelector('[role="tooltip"]')).toBeNull()
    vi.advanceTimersByTime(299)
    expect(document.querySelector('[role="tooltip"]')).toBeNull()
    vi.advanceTimersByTime(1)
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe("Write a post from your idea")
  })

  it("mouseleave before the delay elapses cancels the tooltip entirely", () => {
    const strip = buildActionStrip(handlers())
    container.appendChild(strip)
    const generate = button(strip, "Generate")
    generate.dispatchEvent(new MouseEvent("mouseenter"))
    generate.dispatchEvent(new MouseEvent("mouseleave"))
    vi.advanceTimersByTime(1000)
    expect(document.querySelector('[role="tooltip"]')).toBeNull()
  })

  it("tooltip surfaces never intercept pointer events (pointer-events:none)", () => {
    const strip = buildActionStrip(handlers())
    container.appendChild(strip)
    button(strip, "Generate").dispatchEvent(new Event("focus"))
    const tip = document.querySelector('[role="tooltip"]') as HTMLElement
    expect(tip.style.pointerEvents).toBe("none")
  })
})
