// ─── Templates — reusable post formats ────────────────────────────────────
//
// Deliberately separate from Voice/Style: Voice Training (lib/styleProfile.ts)
// answers "how does this user write," Templates answer "what structures does
// this user repeatedly use." Templates never feed StyleProfile extraction,
// and StyleProfile never determines template structure — the two combine
// only at generation time, as independent inputs (see runTemplate below and
// lib/prompts.ts's TEMPLATE STRUCTURE block).

import type { ChatMessage } from "~lib/ai"
import { buildMessages, type Mode, type OutputLength, type Platform, type Tone } from "~lib/prompts"
import { getStore, setStore } from "~lib/storage"
import type { AmintaTemplate, StyleProfile, TemplateMode, TemplatePlatform, TemplateVariable, VoiceProfile } from "~lib/storage"

// ── CRUD ────────────────────────────────────────────────────────────────

export interface CreateTemplateInput {
  name: string
  description?: string
  mode: TemplateMode
  platform: TemplatePlatform
  content: string
  variables?: TemplateVariable[]
  favorite?: boolean
  tags?: string[]
}

export async function createTemplate(input: CreateTemplateInput): Promise<AmintaTemplate> {
  const now = Date.now()
  const template: AmintaTemplate = {
    id: crypto.randomUUID(),
    name: input.name,
    description: input.description,
    mode: input.mode,
    platform: input.platform,
    content: input.content,
    variables: input.variables ?? [],
    favorite: input.favorite ?? false,
    tags: input.tags ?? [],
    usageCount: 0,
    createdAt: now,
    updatedAt: now,
  }
  const store = await getStore()
  await setStore({ templates: [...store.templates, template] })
  return template
}

export async function updateTemplate(id: string, patch: Partial<Omit<AmintaTemplate, "id" | "createdAt">>): Promise<void> {
  const store = await getStore()
  const templates = store.templates.map((t) =>
    t.id === id ? { ...t, ...patch, updatedAt: Date.now() } : t
  )
  await setStore({ templates })
}

export async function deleteTemplate(id: string): Promise<void> {
  const store = await getStore()
  await setStore({ templates: store.templates.filter((t) => t.id !== id) })
}

export async function toggleFavorite(id: string): Promise<void> {
  const store = await getStore()
  const templates = store.templates.map((t) =>
    t.id === id ? { ...t, favorite: !t.favorite, updatedAt: Date.now() } : t
  )
  await setStore({ templates })
}

// Template-usage tracking — independent of AI-generation tracking
// (incrementGenerations / incrementMissionGenerates in lib/xp.ts /
// lib/missions.ts). Called after any successful use, for all three modes.
export async function recordTemplateUsage(id: string): Promise<void> {
  const store = await getStore()
  const templates = store.templates.map((t) =>
    t.id === id ? { ...t, usageCount: t.usageCount + 1, lastUsedAt: Date.now() } : t
  )
  await setStore({ templates })
}

// ── Variable engine — plain {{variable}} syntax, no rich-text dependency ─

const VARIABLE_RE = /\{\{\s*([^{}]+?)\s*\}\}/g

export function normalizeVariableKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
}

function titleize(key: string): string {
  return key
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

// Scans `content` for {{...}} and returns the ordered list of unique
// normalized keys as they appear.
function scanKeys(content: string): string[] {
  const seen = new Set<string>()
  const ordered: string[] = []
  let match: RegExpExecArray | null
  VARIABLE_RE.lastIndex = 0
  while ((match = VARIABLE_RE.exec(content))) {
    const key = normalizeVariableKey(match[1])
    if (!key || seen.has(key)) continue
    seen.add(key)
    ordered.push(key)
  }
  return ordered
}

// Takes the CURRENT variable list explicitly (not implicit state) so
// labels/defaults/required/order are genuinely preserved across edits:
// keys already present in `existing` keep their full entry and relative
// order; brand-new keys (in content-appearance order) are appended with
// seeded defaults; keys no longer present in `content` are dropped.
export function extractVariables(content: string, existing: TemplateVariable[]): TemplateVariable[] {
  const keysInContent = scanKeys(content)
  const keySet = new Set(keysInContent)
  const existingByKey = new Map(existing.map((v) => [v.key, v]))

  const preserved = existing.filter((v) => keySet.has(v.key))
  const preservedKeys = new Set(preserved.map((v) => v.key))

  const added: TemplateVariable[] = keysInContent
    .filter((k) => !preservedKeys.has(k) && !existingByKey.has(k))
    .map((key) => ({ key, label: titleize(key), required: true }))

  // Preserve original relative order of `existing` entries, then append new
  // keys in the order they first appear in `content`.
  return [...preserved, ...added]
}

// Removes the variable from the list AND strips every literal {{key}}
// occurrence from content (collapsing leftover whitespace), so it cannot
// silently reappear on the next extractVariables pass.
export function deleteVariableEverywhere(
  content: string,
  variables: TemplateVariable[],
  key: string
): { content: string; variables: TemplateVariable[] } {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const placeholderRe = new RegExp(`\\{\\{\\s*${escaped}\\s*\\}\\}`, "g")
  const nextContent = content.replace(placeholderRe, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim()
  return {
    content: nextContent,
    variables: variables.filter((v) => v.key !== key),
  }
}

// The highlight-to-convert helper: normalizes the selected substring into a
// key, auto-suffixes on collision with an existing key so the action never
// silently fails, splices {{key}} into content in place of the selection.
export function insertVariableAtSelection(
  content: string,
  selStart: number,
  selEnd: number,
  existing: TemplateVariable[]
): { content: string; key: string } {
  const selected = content.slice(selStart, selEnd)
  const base = normalizeVariableKey(selected) || "variable"
  const existingKeys = new Set(existing.map((v) => v.key))

  let key = base
  let suffix = 2
  while (existingKeys.has(key)) {
    key = `${base}_${suffix}`
    suffix++
  }

  const nextContent = content.slice(0, selStart) + `{{${key}}}` + content.slice(selEnd)
  return { content: nextContent, key }
}

// Validation lives in the engine, not just the UI. Checks every required
// variable has a non-empty resolved value (from `values` or `defaultValue`);
// returns a structured missing-field error rather than silently rendering
// with blanks. Used identically for Fill templates and for Generate
// templates that contain variables.
export type ResolveResult =
  | { ok: true; text: string }
  | { ok: false; missing: TemplateVariable[] }

export function resolveTemplateContent(
  content: string,
  variables: TemplateVariable[],
  values: Record<string, string>
): ResolveResult {
  const resolved: Record<string, string> = {}
  for (const v of variables) {
    resolved[v.key] = (values[v.key] ?? v.defaultValue ?? "").trim()
  }

  const missing = variables.filter((v) => v.required && !resolved[v.key])
  if (missing.length > 0) return { ok: false, missing }

  const text = content.replace(VARIABLE_RE, (_m, rawKey: string) => {
    const key = normalizeVariableKey(rawKey)
    return resolved[key] ?? ""
  })
  return { ok: true, text }
}

// ── Template runner ─────────────────────────────────────────────────────
// The single seam that decides whether AI is involved at all. Exact and
// Fill never touch any of the injected AI dependencies and never require an
// apiKey. Generate calls them exactly once, identically to a normal
// (non-template) generation, since it's a real model call.

export interface RunTemplateDeps {
  buildMessages: typeof buildMessages
  generateAI: (apiKey: string, model: string, messages: ChatMessage[]) => Promise<string>
  incrementGenerations: () => Promise<void>
  incrementMissionGenerates: () => Promise<void>
}

export const defaultRunTemplateDeps: RunTemplateDeps = {
  buildMessages,
  generateAI: async (apiKey, model, messages) => {
    const { generate } = await import("~lib/ai")
    return generate(apiKey, model, messages)
  },
  incrementGenerations: async () => {
    const { incrementGenerations } = await import("~lib/xp")
    return incrementGenerations()
  },
  incrementMissionGenerates: async () => {
    const { incrementMissionGenerates } = await import("~lib/missions")
    return incrementMissionGenerates()
  },
}

export interface RunTemplateContext {
  apiKey: string
  model: string
  voice: VoiceProfile | null
  styleProfile: StyleProfile | null
  platform: Platform
  mode: Mode
  tone: Tone
  length: OutputLength
  topic: string
}

export async function runTemplate(
  template: AmintaTemplate,
  values: Record<string, string>,
  ctx: RunTemplateContext,
  deps: RunTemplateDeps = defaultRunTemplateDeps
): Promise<ResolveResult> {
  if (template.mode === "exact") {
    // No variables by definition — nothing to resolve, no AI involved.
    return { ok: true, text: template.content }
  }

  if (template.mode === "fill") {
    return resolveTemplateContent(template.content, template.variables, values)
  }

  // "generate" — may itself contain {{variables}}; resolve them first (this
  // can short-circuit with a missing-field error before ever touching AI),
  // then hand the resolved instruction into buildMessages as a third,
  // independent input alongside topic and StyleProfile.
  let instruction = template.content
  if (template.variables.length > 0) {
    const resolved = resolveTemplateContent(template.content, template.variables, values)
    if (!resolved.ok) return resolved
    instruction = resolved.text
  }

  if (!ctx.voice) {
    // Should be gated by the caller (Generate templates need a Voice
    // Profile like any other generation), but never crash on a null voice.
    return { ok: false, missing: [] }
  }

  const messages = deps.buildMessages(ctx.platform, ctx.mode, ctx.voice, ctx.topic, ctx.styleProfile, ctx.tone, ctx.length, instruction)
  const text = await deps.generateAI(ctx.apiKey, ctx.model, messages)
  await deps.incrementGenerations()
  await deps.incrementMissionGenerates()
  return { ok: true, text }
}
