// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  COMPOSER_PRESETS,
  DEFAULT_COMPOSER_LENGTH,
  LENGTH_CYCLE,
  LENGTH_LABEL,
  COMPOSER_BAR_ATTR,
  COMPOSER_BAR_VERSION,
  buildActionStrip,
  isAmintaBar,
  isCurrentBar,
  nextLength,
  presetInstruction,
  type ComposerStripState,
} from "~lib/composerPresets"

const IDLE: ComposerStripState = { preset: null, length: DEFAULT_COMPOSER_LENGTH }

function handlers() {
  return { onGenerate: vi.fn(), onPolish: vi.fn(), onPreset: vi.fn(), onLength: vi.fn() }
}

// jsdom normalizes CSS colors to rgb() and re-spaces declarations, so
// compare against the normalized form rather than the source hex.
const ACCENT_RGB = "rgb(116, 247, 181)"

function labels(strip: HTMLElement): string[] {
  return Array.from(strip.querySelectorAll("button")).map((b) => b.textContent ?? "")
}

function button(strip: HTMLElement, text: string): HTMLButtonElement {
  const el = Array.from(strip.querySelectorAll("button")).find((b) => b.textContent === text)
  if (!el) throw new Error(`No "${text}" — have: ${labels(strip).join(", ")}`)
  return el
}

let container: HTMLDivElement
beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
})

describe("the strip renders every action", () => {
  it("shows Generate, Polish, the three presets, and Length — in order", () => {
    const strip = buildActionStrip(IDLE, handlers())
    expect(labels(strip)).toEqual(["Generate", "Polish", "News", "Product", "You", "Medium"])
  })

  it("Generate is the only primary action; presets and Length are secondary", () => {
    const strip = buildActionStrip(IDLE, handlers())
    expect(button(strip, "Generate").style.background).toContain(ACCENT_RGB)
    expect(button(strip, "News").style.background).not.toContain(ACCENT_RGB)
  })
})

describe("Generate and Polish keep their existing behavior", () => {
  it("Generate calls onGenerate, and nothing else", () => {
    const h = handlers()
    button(buildActionStrip(IDLE, h), "Generate").click()
    expect(h.onGenerate).toHaveBeenCalledTimes(1)
    expect(h.onPolish).not.toHaveBeenCalled()
    expect(h.onPreset).not.toHaveBeenCalled()
  })

  it("Polish calls onPolish — the content script still feeds it the composer text", () => {
    const h = handlers()
    button(buildActionStrip(IDLE, h), "Polish").click()
    expect(h.onPolish).toHaveBeenCalledTimes(1)
    expect(h.onGenerate).not.toHaveBeenCalled()
  })
})

describe("presets select intent — they never generate", () => {
  it.each(["News", "Product", "You"])("%s selects without invoking Generate or Polish", (label) => {
    const h = handlers()
    button(buildActionStrip(IDLE, h), label).click()
    expect(h.onPreset).toHaveBeenCalledTimes(1)
    // The critical guarantee: selecting costs nothing because no generation
    // path is reached at all.
    expect(h.onGenerate).not.toHaveBeenCalled()
    expect(h.onPolish).not.toHaveBeenCalled()
  })

  it("clicking the active preset again clears it (passes null)", () => {
    const h = handlers()
    button(buildActionStrip({ preset: "product", length: "medium" }, h), "Product").click()
    expect(h.onPreset).toHaveBeenCalledWith(null)
  })

  it("the active preset is visually distinct from the inactive ones", () => {
    const strip = buildActionStrip({ preset: "you", length: "medium" }, handlers())
    expect(button(strip, "You").style.color).toBe(ACCENT_RGB)
    expect(button(strip, "News").style.color).not.toBe(ACCENT_RGB)
  })
})

describe("preset routing", () => {
  it("Product routes to launch / feature / build-in-public intent", () => {
    const i = presetInstruction("product")!
    expect(i).toMatch(/launch/i)
    expect(i).toMatch(/build-in-public/i)
  })

  // Truthfulness guard: Aminta has no live-headline retrieval, so the News
  // preset must shape a post from what the user typed and must never imply
  // (or let the model invent) fetched headlines.
  it("News never claims to fetch live news, and forbids inventing specifics", () => {
    const i = presetInstruction("news")!
    expect(i).toMatch(/never invent headlines/i)
    expect(i).toMatch(/ONLY from what the user supplied/i)
    expect(i).not.toMatch(/fetch|search the web|latest headlines|browse/i)

    const news = COMPOSER_PRESETS.find((p) => p.id === "news")!
    expect(news.title).toMatch(/doesn't fetch headlines/i)
  })

  it("You emphasizes the existing Voice pipeline rather than describing a separate model", () => {
    const i = presetInstruction("you")!
    expect(i).toMatch(/WRITING STYLE/)
    expect(i).not.toMatch(/different model|new model|train/i)
  })

  it("no preset selected sends no templateInstruction at all", () => {
    expect(presetInstruction(null)).toBeUndefined()
  })
})

describe("length reuses the canonical Create values", () => {
  it("is exactly short/medium/long", () => {
    expect(LENGTH_CYCLE).toEqual(["short", "medium", "long"])
    expect(Object.keys(LENGTH_LABEL).sort()).toEqual(["long", "medium", "short"])
  })

  it("cycles short -> medium -> long -> short", () => {
    expect(nextLength("short")).toBe("medium")
    expect(nextLength("medium")).toBe("long")
    expect(nextLength("long")).toBe("short")
  })

  it("shows the current selection as its own label", () => {
    expect(labels(buildActionStrip({ preset: null, length: "short" }, handlers()))).toContain("Short")
    expect(labels(buildActionStrip({ preset: null, length: "long" }, handlers()))).toContain("Long")
  })

  it("clicking advances the cycle without generating", () => {
    const h = handlers()
    button(buildActionStrip({ preset: null, length: "short" }, h), "Short").click()
    expect(h.onLength).toHaveBeenCalledWith("medium")
    expect(h.onGenerate).not.toHaveBeenCalled()
  })

  it("defaults to the same value GeneratorPanel starts on", () => {
    expect(DEFAULT_COMPOSER_LENGTH).toBe("medium")
  })
})

describe("narrow composers scroll instead of wrapping", () => {
  it("the strip never wraps and scrolls horizontally", () => {
    const strip = buildActionStrip(IDLE, handlers())
    expect(strip.style.flexWrap).toBe("nowrap")
    expect(strip.style.overflowX).toBe("auto")
    expect(strip.style.minWidth).toBe("0px")
  })

  it("every pill refuses to shrink, so labels never get squashed or broken", () => {
    const strip = buildActionStrip(IDLE, handlers())
    for (const btn of Array.from(strip.querySelectorAll("button"))) {
      expect(btn.style.flexShrink).toBe("0")
      expect(btn.style.whiteSpace).toBe("nowrap")
    }
  })

  it("hides the scrollbar while staying scrollable", () => {
    const strip = buildActionStrip(IDLE, handlers())
    expect(strip.getAttribute("style")).toContain("scrollbar-width: none")
  })
})

describe("composer focus is preserved", () => {
  // A blur would move the caret out of X's contenteditable, which is exactly
  // where insertAmintaText needs to write.
  it("pills suppress mousedown so the composer keeps focus", () => {
    const strip = buildActionStrip(IDLE, handlers())
    const ev = new MouseEvent("mousedown", { bubbles: true, cancelable: true })
    button(strip, "Generate").dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
  })
})

// Regression: the expanded strip shipped in code (f99f448) but X kept
// rendering the old two-button bar. Cause was the injection guard — the bar
// was marked with a version-less data-aminta-bar="1", so after an extension
// reload without a tab refresh the previous build's bar was treated as
// "already injected" and the new one never mounted.
describe("stale bars from a previous build are replaced, not respected", () => {
  function barWith(version: string | null): HTMLElement {
    const el = document.createElement("div")
    if (version !== null) el.setAttribute(COMPOSER_BAR_ATTR, version)
    return el
  }

  it("a bar from THIS build is current — no re-injection", () => {
    expect(isCurrentBar(barWith(COMPOSER_BAR_VERSION))).toBe(true)
  })

  it('the old version-less marker ("1") is NOT current — this is the exact bug', () => {
    expect(isCurrentBar(barWith("1"))).toBe(false)
    // ...but it IS ours, so injectBar removes it rather than leaving it.
    expect(isAmintaBar(barWith("1"))).toBe(true)
  })

  it("any future version mismatch is also treated as stale", () => {
    expect(isCurrentBar(barWith("99"))).toBe(false)
    expect(isAmintaBar(barWith("99"))).toBe(true)
  })

  it("unrelated elements are neither current nor ours", () => {
    expect(isCurrentBar(barWith(null))).toBe(false)
    expect(isAmintaBar(barWith(null))).toBe(false)
    expect(isCurrentBar(null)).toBe(false)
    expect(isAmintaBar(undefined)).toBe(false)
  })

  it("the version is past the original, so already-injected old bars are superseded", () => {
    expect(COMPOSER_BAR_VERSION).not.toBe("1")
  })
})

// Guards the "one canonical renderer" rule: every action the composer offers
// comes from buildActionStrip, so a legacy two-button path can't reappear.
describe("buildActionStrip is the single source of composer actions", () => {
  it("renders all six actions and nothing has to be added elsewhere", () => {
    const strip = buildActionStrip(IDLE, handlers())
    const found = labels(strip)
    for (const required of ["Generate", "Polish", "News", "Product", "You"]) {
      expect(found).toContain(required)
    }
    expect(found.some((l) => ["Short", "Medium", "Long"].includes(l))).toBe(true)
    expect(found).toHaveLength(6)
  })

  it("no action carries the retired pixel-button glyphs", () => {
    const strip = buildActionStrip(IDLE, handlers())
    expect(labels(strip).join(" ")).not.toMatch(/⚄|\+ Polish/)
  })
})
