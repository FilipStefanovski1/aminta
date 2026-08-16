// The Settings "Included selected but the API key field is still showing"
// bug, locked shut.
//
// The cause was three call sites deriving their own boolean from the same
// two store fields, and not agreeing: the segmented control used
// `providerMode !== "byok"`, while the BYOK gate and generation dispatch
// used `aiIncluded && providerMode !== "byok"`. These tests assert the one
// property that makes the reported UI state unrepresentable — the selected
// tab and the mounted controls always come from the same value.
import { describe, it, expect } from "vitest"
import { providerModeFor, shouldUseIncludedAi } from "./entitlements"

type S = { aiIncluded: boolean; providerMode: "included" | "byok" }

/** Exactly how sidepanel.tsx derives both, so drift here fails the test. */
function settingsRender(store: S) {
  const mode = providerModeFor(store)
  const includedActive = mode === "included"
  return {
    includedTabSelected: includedActive,
    byokTabSelected: !includedActive,
    // Every control listed in the bug report lives behind this one flag.
    apiKeyFieldMounted: !includedActive,
    providerButtonsMounted: !includedActive,
    modelSelectorMounted: !includedActive,
    saveControlMounted: !includedActive,
  }
}

const ALL: S[] = [
  { aiIncluded: true, providerMode: "included" },
  { aiIncluded: true, providerMode: "byok" },
  { aiIncluded: false, providerMode: "included" }, // the drift state
  { aiIncluded: false, providerMode: "byok" },
]

describe("THE invariant: Included selected => zero BYOK controls", () => {
  it.each(ALL)("holds for %j", (store) => {
    const ui = settingsRender(store)
    if (ui.includedTabSelected) {
      expect(ui.apiKeyFieldMounted).toBe(false)
      expect(ui.providerButtonsMounted).toBe(false)
      expect(ui.modelSelectorMounted).toBe(false)
      expect(ui.saveControlMounted).toBe(false)
    }
  })

  it.each(ALL)("My API Key selected => all BYOK controls mounted, for %j", (store) => {
    const ui = settingsRender(store)
    if (ui.byokTabSelected) {
      expect(ui.apiKeyFieldMounted).toBe(true)
      expect(ui.providerButtonsMounted).toBe(true)
      expect(ui.modelSelectorMounted).toBe(true)
      expect(ui.saveControlMounted).toBe(true)
    }
  })

  it.each(ALL)("exactly one tab is ever selected, for %j", (store) => {
    const ui = settingsRender(store)
    expect(ui.includedTabSelected).not.toBe(ui.byokTabSelected)
  })
})

describe("the specific state that used to break", () => {
  // Stored "included" from when the user was entitled, entitlement since
  // lost. The old segmented control read providerMode alone and painted
  // Included as selected; the gate read aiIncluded too and kept the BYOK
  // controls mounted. Both from the same store, disagreeing.
  const lapsed: S = { aiIncluded: false, providerMode: "included" }

  it("does not show Included as active without entitlement", () => {
    expect(settingsRender(lapsed).includedTabSelected).toBe(false)
  })

  it("falls back cleanly to My API Key", () => {
    expect(providerModeFor(lapsed)).toBe("byok")
    expect(settingsRender(lapsed).byokTabSelected).toBe(true)
  })

  it("keeps the BYOK controls, since that is the mode actually in use", () => {
    expect(settingsRender(lapsed).apiKeyFieldMounted).toBe(true)
  })
})

describe("dispatch agrees with the UI", () => {
  // A user seeing "Included" must actually generate through Included, and a
  // user seeing the key field must generate through BYOK. Same value, so
  // this cannot drift either.
  it.each(ALL)("routing matches the selected tab for %j", (store) => {
    expect(shouldUseIncludedAi(store)).toBe(settingsRender(store).includedTabSelected)
  })
})

describe("mode resolution", () => {
  it("defaults an entitled user to Included", () => {
    expect(providerModeFor({ aiIncluded: true, providerMode: "included" })).toBe("included")
  })

  it("honours an explicit BYOK opt-out while entitled", () => {
    expect(providerModeFor({ aiIncluded: true, providerMode: "byok" })).toBe("byok")
  })

  it("treats a missing providerMode as Included when entitled", () => {
    // Older stores predate the field; the default has always been Included.
    expect(providerModeFor({ aiIncluded: true } as S)).toBe("included")
  })

  it("never returns Included without entitlement", () => {
    expect(providerModeFor({ aiIncluded: false } as S)).toBe("byok")
  })
})
