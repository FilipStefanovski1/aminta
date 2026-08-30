// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  COMPOSER_BAR_ATTR,
  COMPOSER_BAR_VERSION,
  COMPOSER_PRESETS,
  DEFAULT_COMPOSER_LENGTH,
  DEFAULT_COMPOSER_TONE,
  LENGTH_CYCLE,
  LENGTH_MENU,
  TONE_MENU,
  buildActionStrip,
  isAmintaBar,
  isCurrentBar,
  nextLength,
  presetInstruction,
  resolveComposerLength,
  resolveComposerTone,
  type ComposerStripHandlers,
  type ComposerStripState,
} from "~lib/composerPresets"

const IDLE: ComposerStripState = { preset: null, length: DEFAULT_COMPOSER_LENGTH, tone: DEFAULT_COMPOSER_TONE }

function handlers(extra: Partial<ComposerStripHandlers> = {}): ComposerStripHandlers {
  return {
    onGenerate: vi.fn(),
    onPolish: vi.fn(),
    onPreset: vi.fn(),
    onLength: vi.fn(),
    onTone: vi.fn(),
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

describe("A. toolbar rendering", () => {
  it("main composer shows Generate, Polish, News, Product, a tone pill, and a length pill — no Meme", () => {
    const strip = buildActionStrip(IDLE, handlers())
    const found = labels(strip)
    for (const required of ["Generate", "Polish", "News", "Product", "You", "Auto"]) {
      expect(found.some((l) => l.includes(required))).toBe(true)
    }
    expect(found.some((l) => l.includes("Meme"))).toBe(false)
  })

  it("reply composer (onOpenMeme provided) includes Meme", () => {
    const strip = buildActionStrip(IDLE, handlers({ onOpenMeme: vi.fn() }))
    expect(labels(strip).some((l) => l.includes("Meme"))).toBe(true)
  })

  it("a single call produces a single strip — no duplicate renderer path", () => {
    const strip = buildActionStrip(IDLE, handlers())
    expect(strip.querySelectorAll(".aminta-actions").length).toBe(0) // it IS the strip, not a wrapper containing one
    expect(strip.className).toBe("aminta-actions")
  })
})

describe("B. dropdown affordance", () => {
  it("the tone (You) pill has aria-haspopup and starts collapsed", () => {
    const strip = buildActionStrip(IDLE, handlers())
    const you = button(strip, "You")
    expect(you.getAttribute("aria-haspopup")).toBe("menu")
    expect(you.getAttribute("aria-expanded")).toBe("false")
  })

  it("the length pill has aria-haspopup and starts collapsed", () => {
    const strip = buildActionStrip(IDLE, handlers())
    const length = button(strip, "Auto")
    expect(length.getAttribute("aria-haspopup")).toBe("menu")
    expect(length.getAttribute("aria-expanded")).toBe("false")
  })

  it("Generate has no dropdown affordance — it stays a plain primary action", () => {
    const strip = buildActionStrip(IDLE, handlers())
    const generate = button(strip, "Generate")
    expect(generate.hasAttribute("aria-haspopup")).toBe(false)
  })

  it("News and Product (presets) have no dropdown affordance either — they're plain toggles", () => {
    const strip = buildActionStrip(IDLE, handlers())
    expect(button(strip, "News").hasAttribute("aria-haspopup")).toBe(false)
    expect(button(strip, "Product").hasAttribute("aria-haspopup")).toBe(false)
  })

  it("clicking the tone pill opens its menu and sets aria-expanded", () => {
    const strip = buildActionStrip(IDLE, handlers())
    container.appendChild(strip)
    const you = button(strip, "You")
    you.click()
    expect(you.getAttribute("aria-expanded")).toBe("true")
    expect(strip.querySelector('[role="menu"]')).not.toBeNull()
  })

  it("Escape closes an open menu", () => {
    const strip = buildActionStrip(IDLE, handlers())
    container.appendChild(strip)
    button(strip, "You").click()
    expect(strip.querySelector('[role="menu"]')).not.toBeNull()
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
    expect(strip.querySelector('[role="menu"]')).toBeNull()
  })

  it("an outside click closes an open menu", () => {
    const strip = buildActionStrip(IDLE, handlers())
    container.appendChild(strip)
    button(strip, "You").click()
    expect(strip.querySelector('[role="menu"]')).not.toBeNull()
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
    expect(strip.querySelector('[role="menu"]')).toBeNull()
  })

  it("opening a second dropdown closes the first (only one open at a time)", () => {
    const strip = buildActionStrip(IDLE, handlers())
    container.appendChild(strip)
    button(strip, "You").click()
    expect(strip.querySelectorAll('[role="menu"]')).toHaveLength(1)
    button(strip, "Auto").click()
    expect(strip.querySelectorAll('[role="menu"]')).toHaveLength(1)
  })
})

describe("C. Length — a real dropdown, never a click-to-cycle pill", () => {
  it("shows Auto Length, Short, Medium, Long as menu options", () => {
    const strip = buildActionStrip(IDLE, handlers())
    container.appendChild(strip)
    button(strip, "Auto").click()
    const menu = strip.querySelector('[role="menu"]')!
    const items = Array.from(menu.querySelectorAll('[role="menuitemradio"]')).map((b) => b.textContent)
    expect(items.some((t) => t?.includes("Auto Length"))).toBe(true)
    expect(items.some((t) => t?.includes("Short"))).toBe(true)
    expect(items.some((t) => t?.includes("Medium"))).toBe(true)
    expect(items.some((t) => t?.includes("Long"))).toBe(true)
  })

  it("selecting Short calls onLength with 'short' and never triggers generation or credits", () => {
    const h = handlers()
    const strip = buildActionStrip(IDLE, h)
    container.appendChild(strip)
    button(strip, "Auto").click()
    const menu = strip.querySelector('[role="menu"]')!
    const shortRow = Array.from(menu.querySelectorAll("button")).find((b) => b.textContent?.includes("Short"))!
    shortRow.click()
    expect(h.onLength).toHaveBeenCalledWith("short")
    expect(h.onGenerate).not.toHaveBeenCalled()
    expect(h.onPolish).not.toHaveBeenCalled()
  })

  it("selecting closes the menu", () => {
    const strip = buildActionStrip(IDLE, handlers())
    container.appendChild(strip)
    button(strip, "Auto").click()
    const menu = strip.querySelector('[role="menu"]')!
    const shortRow = Array.from(menu.querySelectorAll("button")).find((b) => b.textContent?.includes("Short"))!
    shortRow.click()
    expect(strip.querySelector('[role="menu"]')).toBeNull()
  })

  it("the pill shows the current selection", () => {
    expect(labels(buildActionStrip({ ...IDLE, length: "short" }, handlers()))).toContain("Short")
    expect(labels(buildActionStrip({ ...IDLE, length: "long" }, handlers()))).toContain("Long")
  })

  it("resolveComposerLength: auto resolves to the real default (medium); every other value passes through unchanged", () => {
    expect(resolveComposerLength("auto")).toBe("medium")
    expect(resolveComposerLength("short")).toBe("short")
    expect(resolveComposerLength("medium")).toBe("medium")
    expect(resolveComposerLength("long")).toBe("long")
  })

  it("LENGTH_MENU only exposes the 4 intended options, in order", () => {
    expect(LENGTH_MENU.map((l) => l.id)).toEqual(["auto", "short", "medium", "long"])
  })

  it("nextLength still cycles short -> medium -> long -> short (kept for any caller that wants simple cycling)", () => {
    expect(nextLength("short")).toBe("medium")
    expect(nextLength("medium")).toBe("long")
    expect(nextLength("long")).toBe("short")
    expect(LENGTH_CYCLE).toEqual(["short", "medium", "long"])
  })
})

describe("D. You / Tone — real Tone values only, never invented ones", () => {
  it("TONE_MENU maps onto the actual supported Tone type plus the voice-first default", () => {
    expect(TONE_MENU.map((t) => t.id)).toEqual(["you", "direct", "witty", "analytical", "inspiring"])
  })

  it("opens a dropdown with all 5 options", () => {
    const strip = buildActionStrip(IDLE, handlers())
    container.appendChild(strip)
    button(strip, "You").click()
    const menu = strip.querySelector('[role="menu"]')!
    expect(menu.querySelectorAll('[role="menuitemradio"]')).toHaveLength(5)
  })

  it("selecting Witty calls onTone with 'witty' and never triggers a generation", () => {
    const h = handlers()
    const strip = buildActionStrip(IDLE, h)
    container.appendChild(strip)
    button(strip, "You").click()
    const menu = strip.querySelector('[role="menu"]')!
    const wittyRow = Array.from(menu.querySelectorAll("button")).find((b) => b.textContent?.includes("Witty"))!
    wittyRow.click()
    expect(h.onTone).toHaveBeenCalledWith("witty")
    expect(h.onGenerate).not.toHaveBeenCalled()
    expect(h.onPolish).not.toHaveBeenCalled()
  })

  it("the pill reflects a selected tone", () => {
    expect(labels(buildActionStrip({ ...IDLE, tone: "witty" }, handlers()))).toContain("Witty")
    expect(labels(buildActionStrip({ ...IDLE, tone: "you" }, handlers()))).toContain("You")
  })

  it("resolveComposerTone: 'you' resolves to the system's existing default tone (direct); real tones pass through unchanged", () => {
    expect(resolveComposerTone("you")).toBe("direct")
    expect(resolveComposerTone("witty")).toBe("witty")
    expect(resolveComposerTone("analytical")).toBe("analytical")
    expect(resolveComposerTone("inspiring")).toBe("inspiring")
  })
})

describe("E. presets — selection only, never generate", () => {
  it.each(["News", "Product"])("%s toggles active without ever invoking Generate or Polish", (label) => {
    const h = handlers()
    const strip = buildActionStrip(IDLE, h)
    button(strip, label).click()
    expect(h.onPreset).toHaveBeenCalledTimes(1)
    expect(h.onGenerate).not.toHaveBeenCalled()
    expect(h.onPolish).not.toHaveBeenCalled()
  })

  it("clicking the already-active preset clears it (passes null)", () => {
    const h = handlers()
    const strip = buildActionStrip({ ...IDLE, preset: "product" }, h)
    button(strip, "Product").click()
    expect(h.onPreset).toHaveBeenCalledWith(null)
  })

  it("clicking an inactive preset selects it", () => {
    const h = handlers()
    const strip = buildActionStrip({ ...IDLE, preset: "product" }, h)
    button(strip, "News").click()
    expect(h.onPreset).toHaveBeenCalledWith("news")
  })

  it("the active preset is visually distinct from an inactive one", () => {
    const strip = buildActionStrip({ ...IDLE, preset: "news" }, handlers())
    const news = button(strip, "News")
    const product = button(strip, "Product")
    expect(news.style.color).not.toBe(product.style.color)
  })

  it("COMPOSER_PRESETS is exactly News and Product — You moved to its own tone control", () => {
    expect(COMPOSER_PRESETS.map((p) => p.id)).toEqual(["news", "product"])
  })
})

describe("preset routing (unchanged templateInstruction design)", () => {
  it("Product routes to launch/feature/build-in-public intent", () => {
    const i = presetInstruction("product")!
    expect(i).toMatch(/launch/i)
    expect(i).toMatch(/build-in-public/i)
  })

  it("News never claims to fetch live news and forbids inventing specifics", () => {
    const i = presetInstruction("news")!
    expect(i).toMatch(/never invent headlines/i)
    expect(i).not.toMatch(/fetch|search the web|browse/i)
  })

  it("no preset selected sends no templateInstruction", () => {
    expect(presetInstruction(null)).toBeUndefined()
  })
})

describe("G. stale bars from a previous build are replaced, not respected", () => {
  function barWith(version: string | null): HTMLElement {
    const el = document.createElement("div")
    if (version !== null) el.setAttribute(COMPOSER_BAR_ATTR, version)
    return el
  }

  it("a bar from THIS build is current", () => {
    expect(isCurrentBar(barWith(COMPOSER_BAR_VERSION))).toBe(true)
  })

  it("a bar from any other version is stale but still ours (removed and replaced, not left alone)", () => {
    expect(isCurrentBar(barWith("1"))).toBe(false)
    expect(isAmintaBar(barWith("1"))).toBe(true)
  })

  it("unrelated elements are neither current nor ours", () => {
    expect(isCurrentBar(barWith(null))).toBe(false)
    expect(isAmintaBar(barWith(null))).toBe(false)
    expect(isCurrentBar(null)).toBe(false)
  })

  it("re-rendering the strip never leaves a stray open menu behind (no leaked listeners across re-renders)", () => {
    const strip1 = buildActionStrip(IDLE, handlers())
    container.appendChild(strip1)
    button(strip1, "You").click()
    expect(strip1.querySelector('[role="menu"]')).not.toBeNull()

    const strip2 = buildActionStrip(IDLE, handlers())
    container.removeChild(strip1)
    container.appendChild(strip2)
    expect(document.querySelectorAll('[role="menu"]')).toHaveLength(0)
  })
})

describe("composer focus is preserved", () => {
  it("pills and menu rows suppress mousedown so the composer keeps focus", () => {
    const strip = buildActionStrip(IDLE, handlers())
    container.appendChild(strip)
    const ev = new MouseEvent("mousedown", { bubbles: true, cancelable: true })
    button(strip, "Generate").dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
  })
})
