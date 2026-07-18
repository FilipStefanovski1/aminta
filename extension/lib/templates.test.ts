import { beforeEach, describe, expect, it, vi } from "vitest"

// In-memory chrome.storage.local stand-in — same pattern as styleProfile.test.ts.
let memoryStore: Record<string, unknown> = {}
vi.stubGlobal("chrome", {
  storage: {
    local: {
      get: (keys: Record<string, unknown>) => Promise.resolve({ ...keys, ...memoryStore }),
      set: (patch: Record<string, unknown>) => {
        memoryStore = { ...memoryStore, ...patch }
        return Promise.resolve()
      },
    },
  },
})

vi.stubGlobal("crypto", {
  ...globalThis.crypto,
  randomUUID: () => `test-uuid-${Math.random().toString(36).slice(2)}`,
})

import type { ChatMessage } from "~lib/ai"
import { getStore } from "~lib/storage"
import type { AmintaTemplate, TemplateVariable, VoiceProfile } from "~lib/storage"
import {
  createTemplate,
  deleteVariableEverywhere,
  extractVariables,
  insertVariableAtSelection,
  normalizeVariableKey,
  recordTemplateUsage,
  resolveTemplateContent,
  runTemplate,
  type RunTemplateContext,
  type RunTemplateDeps,
} from "~lib/templates"

beforeEach(() => {
  memoryStore = {}
})

function baseVoice(): VoiceProfile {
  return { niche: "general", tone: "casual", examples: "", voiceStyle: "casual", voiceInspiration: "nobody", customRules: "" }
}

function baseCtx(overrides: Partial<RunTemplateContext> = {}): RunTemplateContext {
  return {
    apiKey: "",
    model: "",
    voice: baseVoice(),
    styleProfile: null,
    platform: "x",
    mode: "tweet",
    tone: "direct",
    length: "medium",
    topic: "a topic",
    ...overrides,
  }
}

function mockDeps(generatedText = "AI generated text"): RunTemplateDeps & {
  buildMessagesMock: ReturnType<typeof vi.fn>
  generateAIMock: ReturnType<typeof vi.fn>
  incrementGenerationsMock: ReturnType<typeof vi.fn>
  incrementMissionGeneratesMock: ReturnType<typeof vi.fn>
} {
  const buildMessagesMock = vi.fn(
    (): ChatMessage[] => [{ role: "system", content: "sys" }, { role: "user", content: "user" }]
  )
  const generateAIMock = vi.fn().mockResolvedValue(generatedText)
  const incrementGenerationsMock = vi.fn().mockResolvedValue(undefined)
  const incrementMissionGeneratesMock = vi.fn().mockResolvedValue(undefined)
  return {
    buildMessages: buildMessagesMock,
    generateAI: generateAIMock,
    incrementGenerations: incrementGenerationsMock,
    incrementMissionGenerates: incrementMissionGeneratesMock,
    buildMessagesMock,
    generateAIMock,
    incrementGenerationsMock,
    incrementMissionGeneratesMock,
  }
}

function makeTemplate(overrides: Partial<AmintaTemplate> = {}): AmintaTemplate {
  const now = Date.now()
  return {
    id: "t1",
    name: "Test template",
    mode: "exact",
    platform: "any",
    content: "hello world",
    variables: [],
    favorite: false,
    tags: [],
    usageCount: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe("normalizeVariableKey", () => {
  it("lowercases, trims, and converts spaces to underscores", () => {
    expect(normalizeVariableKey("  New Feature  ")).toBe("new_feature")
  })

  it("strips characters outside [a-z0-9_]", () => {
    expect(normalizeVariableKey("Feature #1!")).toBe("feature_1")
  })
})

describe("extractVariables", () => {
  it("detects new {{variables}} and seeds defaults", () => {
    const vars = extractVariables("Just shipped {{feature}} for {{audience}}.", [])
    expect(vars.map((v) => v.key)).toEqual(["feature", "audience"])
    expect(vars[0].label).toBe("Feature")
    expect(vars[0].required).toBe(true)
  })

  it("preserves existing label/required/default/order across edits", () => {
    const existing: TemplateVariable[] = [
      { key: "feature", label: "The Feature", required: false, defaultValue: "widget" },
    ]
    const vars = extractVariables("Just shipped {{feature}} for {{audience}}.", existing)
    expect(vars[0]).toEqual(existing[0]) // untouched
    expect(vars[1].key).toBe("audience") // newly appended
  })

  it("drops variables no longer present in content", () => {
    const existing: TemplateVariable[] = [
      { key: "feature", label: "Feature", required: true },
      { key: "audience", label: "Audience", required: true },
    ]
    const vars = extractVariables("Just shipped {{feature}}.", existing)
    expect(vars.map((v) => v.key)).toEqual(["feature"])
  })

  it("dedupes repeated occurrences of the same variable", () => {
    const vars = extractVariables("{{feature}} is great. {{feature}} rocks.", [])
    expect(vars.map((v) => v.key)).toEqual(["feature"])
  })
})

describe("deleteVariableEverywhere", () => {
  it("removes the variable from the list and strips its placeholder from content", () => {
    const variables: TemplateVariable[] = [
      { key: "feature", label: "Feature", required: true },
      { key: "audience", label: "Audience", required: true },
    ]
    const { content, variables: nextVars } = deleteVariableEverywhere(
      "Just shipped {{feature}} for {{audience}}.",
      variables,
      "feature"
    )
    expect(content).not.toContain("{{feature}}")
    expect(nextVars.map((v) => v.key)).toEqual(["audience"])
  })

  it("prevents the deleted variable from reappearing on re-extraction", () => {
    const variables: TemplateVariable[] = [{ key: "feature", label: "Feature", required: true }]
    const { content, variables: nextVars } = deleteVariableEverywhere("Shipped {{feature}}.", variables, "feature")
    const reExtracted = extractVariables(content, nextVars)
    expect(reExtracted.find((v) => v.key === "feature")).toBeUndefined()
  })
})

describe("insertVariableAtSelection", () => {
  it("converts a text selection into a {{variable}}", () => {
    const content = "Just shipped new feature today."
    const selStart = content.indexOf("new feature")
    const selEnd = selStart + "new feature".length
    const { content: next, key } = insertVariableAtSelection(content, selStart, selEnd, [])
    expect(key).toBe("new_feature")
    expect(next).toBe("Just shipped {{new_feature}} today.")
  })

  it("auto-suffixes on key collision instead of failing", () => {
    const existing: TemplateVariable[] = [{ key: "feature", label: "Feature", required: true }]
    const { key } = insertVariableAtSelection("Shipped feature today.", 8, 15, existing)
    expect(key).toBe("feature_2")
  })
})

describe("resolveTemplateContent", () => {
  const variables: TemplateVariable[] = [
    { key: "feature", label: "Feature", required: true },
    { key: "audience", label: "Audience", required: false, defaultValue: "everyone" },
  ]
  const content = "Shipped {{feature}} for {{audience}}."

  it("substitutes provided values and falls back to defaultValue", () => {
    const result = resolveTemplateContent(content, variables, { feature: "dark mode" })
    expect(result).toEqual({ ok: true, text: "Shipped dark mode for everyone." })
  })

  it("returns a structured missing-field error when a required field is unmet", () => {
    const result = resolveTemplateContent(content, variables, {})
    expect(result.ok).toBe(false)
    if (result.ok === false) {
      expect(result.missing.map((v) => v.key)).toEqual(["feature"])
    }
  })
})

describe("CRUD round-trip", () => {
  it("creates and persists a template", async () => {
    const t = await createTemplate({ name: "GM post", mode: "exact", content: "gm ☀️" })
    const store = await getStore()
    expect(store.templates).toHaveLength(1)
    expect(store.templates[0].id).toBe(t.id)
    expect(store.templates[0].usageCount).toBe(0)
  })

  it("always tags new templates as the X platform (X is the only supported platform)", async () => {
    const t = await createTemplate({ name: "GM post", mode: "exact", content: "gm ☀️" })
    expect(t.platform).toBe("x")
  })

  it("recordTemplateUsage increments usageCount and sets lastUsedAt", async () => {
    const t = await createTemplate({ name: "GM post", mode: "exact", content: "gm ☀️" })
    await recordTemplateUsage(t.id)
    const store = await getStore()
    expect(store.templates[0].usageCount).toBe(1)
    expect(store.templates[0].lastUsedAt).toBeGreaterThan(0)
  })
})

describe("runTemplate — AI isolation (the core safety requirement)", () => {
  it("exact mode never touches any AI dependency and requires no apiKey", async () => {
    const template = makeTemplate({ mode: "exact", content: "gm everyone ☀️" })
    const deps = mockDeps()
    const ctx = baseCtx({ apiKey: "" }) // no key on purpose

    const result = await runTemplate(template, {}, ctx, deps)

    expect(result).toEqual({ ok: true, text: "gm everyone ☀️" })
    expect(deps.generateAIMock).not.toHaveBeenCalled()
    expect(deps.incrementGenerationsMock).not.toHaveBeenCalled()
    expect(deps.incrementMissionGeneratesMock).not.toHaveBeenCalled()
  })

  it("fill mode never touches any AI dependency and requires no apiKey", async () => {
    const template = makeTemplate({
      mode: "fill",
      content: "Shipped {{feature}}.",
      variables: [{ key: "feature", label: "Feature", required: true }],
    })
    const deps = mockDeps()
    const ctx = baseCtx({ apiKey: "" })

    const result = await runTemplate(template, { feature: "dark mode" }, ctx, deps)

    expect(result).toEqual({ ok: true, text: "Shipped dark mode." })
    expect(deps.generateAIMock).not.toHaveBeenCalled()
    expect(deps.incrementGenerationsMock).not.toHaveBeenCalled()
    expect(deps.incrementMissionGeneratesMock).not.toHaveBeenCalled()
  })

  it("fill mode surfaces a structured missing-field error without touching AI", async () => {
    const template = makeTemplate({
      mode: "fill",
      content: "Shipped {{feature}}.",
      variables: [{ key: "feature", label: "Feature", required: true }],
    })
    const deps = mockDeps()
    const result = await runTemplate(template, {}, baseCtx(), deps)

    expect(result.ok).toBe(false)
    if (result.ok === false) expect(result.missing[0].key).toBe("feature")
    expect(deps.generateAIMock).not.toHaveBeenCalled()
  })

  it("generate mode calls generateAI exactly once, plus both AI-tracking calls exactly once", async () => {
    const template = makeTemplate({ mode: "generate", content: "Write a launch post." })
    const deps = mockDeps("model output text")

    const result = await runTemplate(template, {}, baseCtx({ apiKey: "gsk_test" }), deps)

    expect(result).toEqual({ ok: true, text: "model output text" })
    expect(deps.generateAIMock).toHaveBeenCalledTimes(1)
    expect(deps.incrementGenerationsMock).toHaveBeenCalledTimes(1)
    expect(deps.incrementMissionGeneratesMock).toHaveBeenCalledTimes(1)
    expect(deps.buildMessagesMock).toHaveBeenCalledTimes(1)
  })

  it("generate mode with variables resolves them before calling buildMessages/generateAI", async () => {
    const template = makeTemplate({
      mode: "generate",
      content: "Write a launch post about {{feature}}.",
      variables: [{ key: "feature", label: "Feature", required: true }],
    })
    const deps = mockDeps()

    await runTemplate(template, { feature: "dark mode" }, baseCtx({ apiKey: "gsk_test" }), deps)

    expect(deps.buildMessagesMock).toHaveBeenCalledTimes(1)
    const templateInstructionArg = deps.buildMessagesMock.mock.calls[0][7]
    expect(templateInstructionArg).toBe("Write a launch post about dark mode.")
  })

  it("generate mode with an unmet required variable short-circuits before ever calling generateAI", async () => {
    const template = makeTemplate({
      mode: "generate",
      content: "Write a launch post about {{feature}}.",
      variables: [{ key: "feature", label: "Feature", required: true }],
    })
    const deps = mockDeps()

    const result = await runTemplate(template, {}, baseCtx({ apiKey: "gsk_test" }), deps)

    expect(result.ok).toBe(false)
    if (result.ok === false) expect(result.missing[0].key).toBe("feature")
    expect(deps.generateAIMock).not.toHaveBeenCalled()
    expect(deps.incrementGenerationsMock).not.toHaveBeenCalled()
    expect(deps.incrementMissionGeneratesMock).not.toHaveBeenCalled()
  })
})
