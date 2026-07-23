import { useMemo, useRef, useState } from "react"

import {
  createTemplate,
  defaultRunTemplateDeps,
  deleteTemplate,
  deleteVariableEverywhere,
  extractVariables,
  insertVariableAtSelection,
  recordTemplateUsage,
  runTemplate,
  toggleFavorite,
  updateTemplate,
  type RunTemplateContext,
} from "~lib/templates"
import { insertText } from "~lib/messaging"
import type { AmintaStore, AmintaTemplate, TemplateMode, TemplateVariable } from "~lib/storage"
import { C } from "~lib/theme"

import { Card, GhostButton, PrimaryButton, SectionLabel } from "~components/ui"

type View = "list" | "editor" | "use"

interface Props {
  store: AmintaStore
  onClose: () => void
  // Templates persist directly to chrome.storage.local (see lib/templates.ts),
  // bypassing the sidepanel's own in-memory store state. Call this after
  // every mutation so that state gets refreshed — otherwise the next time
  // this modal mounts it re-reads the now-stale `store.templates` prop and
  // newly created/edited templates appear to vanish.
  onChanged?: () => void
  getRunContext: () => Promise<RunTemplateContext>
  initialView?: View
  prefill?: { content: string; mode: TemplateMode }
}

const MODE_LABEL: Record<TemplateMode, string> = { exact: "Exact", fill: "Fill", generate: "AI" }

function badge(text: string, color: string) {
  return (
    <span
      className="px-1.5 py-0.5 rounded font-pixel text-[6px] uppercase tracking-wider"
      style={{ backgroundColor: color + "18", color, border: `1px solid ${color}30` }}>
      {text}
    </span>
  )
}

export default function TemplatesModal({ store, onClose, onChanged, getRunContext, initialView = "list", prefill }: Props) {
  const [view, setView] = useState<View>(prefill ? "editor" : initialView)
  const [editing, setEditing] = useState<AmintaTemplate | null>(null)
  const [usingTemplate, setUsingTemplate] = useState<AmintaTemplate | null>(null)
  const [templates, setTemplates] = useState<AmintaTemplate[]>(store.templates)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  // Which card's "Use Template" button is mid-insert — scoped per-template
  // (not a single global flag) so only that one button disables/shows
  // "Inserting…", and so a click on it can never fire twice concurrently.
  const [insertingId, setInsertingId] = useState<string | null>(null)
  const [toast, setToast] = useState("")

  const refresh = (next: AmintaTemplate[]) => setTemplates(next)

  const favorites = useMemo(() => templates.filter((t) => t.favorite), [templates])
  const recent = useMemo(
    () => [...templates].filter((t) => t.lastUsedAt).sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0)).slice(0, 5),
    [templates]
  )
  const all = useMemo(() => [...templates].sort((a, b) => b.updatedAt - a.updatedAt), [templates])

  function openCreate() {
    setEditing(null)
    setView("editor")
  }

  function openEdit(t: AmintaTemplate) {
    setEditing(t)
    setView("editor")
  }

  async function handleToggleFavorite(id: string) {
    await toggleFavorite(id)
    refresh(templates.map((t) => (t.id === id ? { ...t, favorite: !t.favorite } : t)))
    onChanged?.()
  }

  async function handleDelete(id: string) {
    await deleteTemplate(id)
    refresh(templates.filter((t) => t.id !== id))
    onChanged?.()
  }

  // Delivers resolved template text into the active X composer (reusing the
  // exact same bridge OutputCard's "Insert into X" uses — twitter-bridge.ts's
  // insertIntoComposer, which handles contenteditable, paste-based insertion,
  // focus, and cursor placement correctly already). Returns whether it
  // actually landed, so callers can decide what happens next.
  async function insertIntoXComposer(templateId: string, text: string): Promise<boolean> {
    const res = await insertText("x", text)
    if (!res.ok) {
      setError("Open an X composer first")
      return false
    }
    await recordTemplateUsage(templateId)
    onChanged?.()
    return true
  }

  function celebrateAndClose() {
    setToast("Template inserted")
    setTimeout(onClose, 900)
  }

  // The "Use Template" button's handler. Tries to resolve the template with
  // no user input first (covers Exact always, and Fill/Generate whenever
  // every variable already has a default) — only if something is genuinely
  // missing does it fall back to the variable-input screen.
  async function handleUseTemplate(t: AmintaTemplate) {
    if (insertingId) return // a click is already in flight — ignore
    setError("")
    setInsertingId(t.id)
    try {
      const ctx = await getRunContext()
      const result = await runTemplate(t, {}, ctx, defaultRunTemplateDeps)
      if (result.ok === false) {
        if (result.missing.length > 0) {
          setUsingTemplate(t)
          setView("use")
          return
        }
        setError("Couldn't use this template. Check your voice profile and API key.")
        return
      }
      const delivered = await insertIntoXComposer(t.id, result.text)
      if (delivered) celebrateAndClose()
    } catch (e) {
      console.error("[Aminta] template insert failed:", e)
      setError("Couldn't insert template")
    } finally {
      setInsertingId(null)
    }
  }

  return (
    // fixed (not absolute) — GeneratorPanel, where this mounts, is a
    // scrollable, variable-height, non-positioned container, unlike the
    // sidepanel root that SettingsOverlay/CompanionPage anchor to. fixed
    // guarantees full-viewport coverage regardless of mount depth.
    <div className="fixed inset-0 z-40 flex flex-col animate-slide-up" style={{ backgroundColor: C.bg }}>
      <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: `1px solid ${C.border}` }}>
        <p className="font-pixel text-[9px]" style={{ color: C.text }}>
          {view === "list" ? "Templates" : view === "editor" ? (editing ? "Edit template" : "New template") : "Use template"}
        </p>
        <button
          onClick={view === "list" ? onClose : () => setView("list")}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/5 transition-colors text-[13px]"
          style={{ color: C.textFaint }}>
          {view === "list" ? "✕" : "←"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {view === "list" && (
          <TemplateList
            favorites={favorites}
            recent={recent}
            all={all}
            onCreate={openCreate}
            onEdit={openEdit}
            onUseTemplate={handleUseTemplate}
            insertingId={insertingId}
            onToggleFavorite={handleToggleFavorite}
            onDelete={handleDelete}
          />
        )}

        {view === "editor" && (
          <TemplateEditor
            initial={editing}
            prefill={prefill}
            onCancel={() => setView("list")}
            onSaved={(t) => {
              refresh(editing ? templates.map((x) => (x.id === t.id ? t : x)) : [...templates, t])
              onChanged?.()
              setView("list")
            }}
          />
        )}

        {view === "use" && usingTemplate && (
          <TemplateUseForm
            template={usingTemplate}
            busy={busy}
            error={error}
            onCancel={() => setView("list")}
            onSubmit={async (values) => {
              setBusy(true)
              setError("")
              try {
                const ctx = await getRunContext()
                const result = await runTemplate(usingTemplate, values, ctx, defaultRunTemplateDeps)
                if (result.ok === false) {
                  setError(
                    result.missing.length
                      ? `Missing required field${result.missing.length > 1 ? "s" : ""}: ${result.missing.map((m) => m.label).join(", ")}`
                      : "Couldn't use this template. Check your voice profile and API key."
                  )
                  return
                }
                const delivered = await insertIntoXComposer(usingTemplate.id, result.text)
                if (delivered) celebrateAndClose()
              } catch (e) {
                console.error("[Aminta] template insert failed:", e)
                setError("Couldn't insert template")
              } finally {
                setBusy(false)
              }
            }}
          />
        )}
      </div>

      {toast && (
        <div
          className="absolute left-1/2 -translate-x-1/2 bottom-6 z-50 px-4 py-2 rounded-full font-pixel text-[9px] text-black shadow-lg animate-toast-up"
          style={{ backgroundColor: C.mint }}>
          {toast}
        </div>
      )}
    </div>
  )

  function TemplateList({
    favorites,
    recent,
    all,
    onCreate,
    onEdit,
    onUseTemplate,
    insertingId,
    onToggleFavorite,
    onDelete,
  }: {
    favorites: AmintaTemplate[]
    recent: AmintaTemplate[]
    all: AmintaTemplate[]
    onCreate: () => void
    onEdit: (t: AmintaTemplate) => void
    onUseTemplate: (t: AmintaTemplate) => void
    insertingId: string | null
    onToggleFavorite: (id: string) => void
    onDelete: (id: string) => void
  }) {
    // "Recent" and "My Templates" both render straight from the same
    // `templates` state array (filtered/sorted, never cloned) — a template
    // that appears in both sections is the same object with the same id, so
    // its card in either section calls the exact same handlers below.
    return (
      <div className="space-y-5">
        <PrimaryButton onClick={onCreate}>+ New Template</PrimaryButton>

        {templates.length === 0 && (
          <p className="text-[11px] text-center py-6" style={{ color: C.textFaint }}>
            No templates yet. Save a draft as a template, or create one from scratch.
          </p>
        )}

        {favorites.length > 0 && (
          <div>
            <SectionLabel>⭐ Favorites</SectionLabel>
            <div className="space-y-2">
              {favorites.map((t) => (
                <TemplateCard key={t.id} t={t} inserting={insertingId === t.id} onUseTemplate={() => onUseTemplate(t)} onEdit={() => onEdit(t)} onToggleFavorite={() => onToggleFavorite(t.id)} onDelete={() => onDelete(t.id)} />
              ))}
            </div>
          </div>
        )}

        {recent.length > 0 && (
          <div>
            <SectionLabel>🕒 Recent</SectionLabel>
            <div className="space-y-2">
              {recent.map((t) => (
                <TemplateCard key={t.id} t={t} inserting={insertingId === t.id} onUseTemplate={() => onUseTemplate(t)} onEdit={() => onEdit(t)} onToggleFavorite={() => onToggleFavorite(t.id)} onDelete={() => onDelete(t.id)} />
              ))}
            </div>
          </div>
        )}

        {all.length > 0 && (
          <div>
            <SectionLabel>My Templates</SectionLabel>
            <div className="space-y-2">
              {all.map((t) => (
                <TemplateCard key={t.id} t={t} inserting={insertingId === t.id} onUseTemplate={() => onUseTemplate(t)} onEdit={() => onEdit(t)} onToggleFavorite={() => onToggleFavorite(t.id)} onDelete={() => onDelete(t.id)} />
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  function TemplateCard({
    t,
    inserting,
    onUseTemplate,
    onEdit,
    onToggleFavorite,
    onDelete,
  }: {
    t: AmintaTemplate
    inserting: boolean
    onUseTemplate: () => void
    onEdit: () => void
    onToggleFavorite: () => void
    onDelete: () => void
  }) {
    return (
      <Card className="space-y-2" pad>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold truncate" style={{ color: C.text }}>{t.name}</p>
            {t.description && <p className="text-[10px] mt-0.5" style={{ color: C.textFaint }}>{t.description}</p>}
          </div>
          <button onClick={onToggleFavorite} className="text-[13px] shrink-0" style={{ color: t.favorite ? C.mint : C.textGhost }}>
            {t.favorite ? "★" : "☆"}
          </button>
        </div>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex gap-1.5 shrink-0">
            {badge(MODE_LABEL[t.mode], C.mint)}
          </div>
          <div className="flex items-center gap-3 flex-wrap justify-end ml-auto">
            <button onClick={onEdit} className="text-[10px]" style={{ color: C.textFaint }}>Edit</button>
            <button onClick={onDelete} className="text-[10px]" style={{ color: "#f87171" }}>Delete</button>
            <button
              onClick={onUseTemplate}
              disabled={inserting}
              className="btn-pixel px-3 py-1.5 rounded-lg font-pixel text-[8px] text-black disabled:opacity-60 disabled:cursor-wait transition-opacity shrink-0"
              style={{ backgroundColor: C.mint }}>
              {inserting ? "Inserting…" : "Use Template"}
            </button>
          </div>
        </div>
      </Card>
    )
  }
}

// ─── Editor ─────────────────────────────────────────────────────────────

function TemplateEditor({
  initial,
  prefill,
  onCancel,
  onSaved,
}: {
  initial: AmintaTemplate | null
  prefill?: { content: string; mode: TemplateMode }
  onCancel: () => void
  onSaved: (t: AmintaTemplate) => void
}) {
  const [name, setName] = useState(initial?.name ?? "")
  const [description, setDescription] = useState(initial?.description ?? "")
  const [mode, setMode] = useState<TemplateMode>(initial?.mode ?? prefill?.mode ?? "exact")
  const [content, setContent] = useState(initial?.content ?? prefill?.content ?? "")
  const [variables, setVariables] = useState<TemplateVariable[]>(initial?.variables ?? [])
  const [error, setError] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const supportsVariables = mode === "fill" || mode === "generate"

  function onContentChange(next: string) {
    setContent(next)
    if (supportsVariables) setVariables((prev) => extractVariables(next, prev))
  }

  function convertSelection() {
    const el = textareaRef.current
    if (!el || el.selectionStart === el.selectionEnd) return
    const { content: nextContent, key } = insertVariableAtSelection(content, el.selectionStart, el.selectionEnd, variables)
    setContent(nextContent)
    setVariables((prev) => extractVariables(nextContent, prev.some((v) => v.key === key) ? prev : [...prev, { key, label: key, required: true }]))
  }

  function removeVariable(key: string) {
    const { content: nextContent, variables: nextVariables } = deleteVariableEverywhere(content, variables, key)
    setContent(nextContent)
    setVariables(nextVariables)
  }

  function moveVariable(index: number, dir: -1 | 1) {
    setVariables((prev) => {
      const next = [...prev]
      const target = index + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  function updateVariable(key: string, patch: Partial<TemplateVariable>) {
    setVariables((prev) => prev.map((v) => (v.key === key ? { ...v, ...patch } : v)))
  }

  async function save() {
    if (!name.trim()) { setError("Give this template a name."); return }
    if (!content.trim()) { setError("Content can't be empty."); return }
    setError("")

    if (initial) {
      await updateTemplate(initial.id, { name: name.trim(), description: description.trim() || undefined, mode, content, variables })
      onSaved({ ...initial, name: name.trim(), description: description.trim() || undefined, mode, content, variables, updatedAt: Date.now() })
    } else {
      const t = await createTemplate({ name: name.trim(), description: description.trim() || undefined, mode, content, variables })
      onSaved(t)
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <p className="text-[11px] font-medium" style={{ color: C.textFaint }}>Name</p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Product launch"
          className="input-pixel w-full rounded-xl px-3 py-2.5 text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <p className="text-[11px] font-medium" style={{ color: C.textFaint }}>
          Description <span style={{ color: C.textGhost, fontWeight: 400 }}>(optional)</span>
        </p>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What this template is for"
          className="input-pixel w-full rounded-xl px-3 py-2.5 text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <p className="text-[11px] font-medium" style={{ color: C.textFaint }}>Type</p>
        <div className="grid grid-cols-3 gap-1.5">
          {(["exact", "fill", "generate"] as TemplateMode[]).map((m) => {
            const active = mode === m
            return (
              <button
                key={m}
                onClick={() => setMode(m)}
                className="rounded-xl py-2.5 text-[10px] font-semibold transition-all"
                style={{
                  backgroundColor: active ? C.mint + "18" : C.card,
                  border: `1.5px solid ${active ? C.mint : C.border}`,
                  color: active ? C.mint : C.textDim,
                }}>
                {MODE_LABEL[m]}
              </button>
            )
          })}
        </div>
        <p className="text-[9px]" style={{ color: C.textGhost }}>
          {mode === "exact" && "Inserted exactly as written, no AI rewriting."}
          {mode === "fill" && "Fill in {{variables}} to complete the post, no AI rewriting."}
          {mode === "generate" && "An instruction. Aminta writes a fresh version using your Style Profile every time."}
        </p>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-medium" style={{ color: C.textFaint }}>
            {mode === "generate" ? "Instruction" : "Content"}
          </p>
          {supportsVariables && (
            <button onClick={convertSelection} className="text-[10px]" style={{ color: C.mint }}>
              Convert selection → variable
            </button>
          )}
        </div>
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => onContentChange(e.target.value)}
          rows={6}
          placeholder={
            mode === "exact"
              ? "gm everyone ☀️"
              : mode === "fill"
                ? "Just shipped {{feature}}.\n\nIt helps {{audience}} do {{benefit}}.\n\nTry it here: {{link}}"
                : "Write a launch post. Start with what shipped. Explain one concrete benefit. Finish with a casual CTA."
          }
          className="input-pixel w-full rounded-xl px-3 py-2.5 text-sm resize-none"
        />
        {supportsVariables && (
          <p className="text-[9px]" style={{ color: C.textGhost }}>
            Type <code>{"{{variable}}"}</code> directly, or highlight text above and convert it.
          </p>
        )}
      </div>

      {supportsVariables && variables.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium" style={{ color: C.textFaint }}>Variables</p>
          <div className="space-y-2">
            {variables.map((v, i) => (
              <Card key={v.key} pad className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <input
                    value={v.label}
                    onChange={(e) => updateVariable(v.key, { label: e.target.value })}
                    className="input-pixel flex-1 rounded-lg px-2 py-1 text-[11px]"
                  />
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => moveVariable(i, -1)} disabled={i === 0} className="text-[10px] disabled:opacity-30" style={{ color: C.textFaint }}>↑</button>
                    <button onClick={() => moveVariable(i, 1)} disabled={i === variables.length - 1} className="text-[10px] disabled:opacity-30" style={{ color: C.textFaint }}>↓</button>
                    <button onClick={() => removeVariable(v.key)} className="text-[10px]" style={{ color: "#f87171" }}>✕</button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    value={v.defaultValue ?? ""}
                    onChange={(e) => updateVariable(v.key, { defaultValue: e.target.value })}
                    placeholder="Default value (optional)"
                    className="input-pixel flex-1 rounded-lg px-2 py-1 text-[10px]"
                  />
                  <label className="flex items-center gap-1 text-[9px] shrink-0" style={{ color: C.textFaint }}>
                    <input type="checkbox" checked={v.required} onChange={(e) => updateVariable(v.key, { required: e.target.checked })} />
                    Required
                  </label>
                </div>
                <p className="text-[8px] font-mono" style={{ color: C.textGhost }}>{"{{" + v.key + "}}"}</p>
              </Card>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-[11px] text-red-400">{error}</p>}

      <div className="flex gap-2 pt-1">
        <GhostButton onClick={onCancel} className="flex-1">Cancel</GhostButton>
        <PrimaryButton onClick={save} className="flex-1">Save</PrimaryButton>
      </div>
    </div>
  )
}

// ─── Use flow (variable input, or a simple confirm for no-variable templates) ─

function TemplateUseForm({
  template,
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  template: AmintaTemplate
  busy: boolean
  error: string
  onCancel: () => void
  onSubmit: (values: Record<string, string>) => void
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(template.variables.map((v) => [v.key, v.defaultValue ?? ""]))
  )

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[13px] font-semibold" style={{ color: C.text }}>{template.name}</p>
        {template.description && <p className="text-[11px] mt-1" style={{ color: C.textFaint }}>{template.description}</p>}
      </div>

      {template.variables.length === 0 ? (
        <p className="text-[11px]" style={{ color: C.textFaint }}>
          {template.mode === "exact" ? "This will be inserted exactly as written." : "Aminta will generate a fresh post from this template."}
        </p>
      ) : (
        <div className="space-y-3">
          {template.variables.map((v) => (
            <div key={v.key} className="space-y-1">
              <p className="text-[11px] font-medium" style={{ color: C.textFaint }}>
                {v.label}{v.required && <span style={{ color: "#f87171" }}> *</span>}
              </p>
              <input
                value={values[v.key] ?? ""}
                onChange={(e) => setValues((prev) => ({ ...prev, [v.key]: e.target.value }))}
                placeholder={v.placeholder}
                className="input-pixel w-full rounded-xl px-3 py-2.5 text-sm"
              />
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-[11px] text-red-400">{error}</p>}

      <div className="flex gap-2 pt-1">
        <GhostButton onClick={onCancel} className="flex-1">Cancel</GhostButton>
        <PrimaryButton onClick={() => onSubmit(values)} disabled={busy} className="flex-1">
          {busy ? "…" : template.mode === "generate" ? "Generate" : "Use template"}
        </PrimaryButton>
      </div>
    </div>
  )
}
