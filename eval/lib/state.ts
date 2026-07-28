import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import type { BlindingKeyEntry, RawGeneration, SurpriseWorksheet, TopicSpec } from "./types.ts"
import { fileExists, readJson, writeJson } from "./fsUtil.ts"

// Single responsibility: establish and persist the blind identity/grouping
// structure a run's judging, worksheet, and report all read from. Loading,
// blind-ID assignment, and worksheet-session building are kept together
// deliberately — they're sequential steps of one job (you can't assign
// blind IDs without knowing what generations exist; you can't build
// sessions without the blind IDs), not independent concerns that happen to
// share a file. Splitting them would just relocate that same dependency
// chain across a file boundary without reducing it.

const EVAL_ROOT = join(import.meta.dirname, "..")
const OUTPUTS_ROOT = join(EVAL_ROOT, "outputs")

export function runDir(runId: string): string {
  return join(OUTPUTS_ROOT, runId)
}
export function rawDir(runId: string): string {
  return join(runDir(runId), "raw")
}
export function judgedDir(runId: string): string {
  return join(runDir(runId), "judged")
}
export function reportPath(runId: string): string {
  return join(runDir(runId), "report.md")
}

// readdirSync's listing order isn't guaranteed stable across filesystems —
// the canonical sort below, not directory order, is what the one-time
// blind-ID shuffle's determinism actually rests on.
export function loadRawGenerations(runId: string): RawGeneration[] {
  const dir = rawDir(runId)
  if (!existsSync(dir)) return []
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"))
  const records = files.map((f) => readJson<RawGeneration>(join(dir, f)))
  return records.sort((a, b) => a.topicId.localeCompare(b.topicId) || a.arm.localeCompare(b.arm) || a.index - b.index)
}

export interface RunIdentity {
  keyFile: BlindingKeyEntry[]
  outIdToGen: Map<string, RawGeneration>
}

// Assigns blind OUT-## ids the first time this is called for a run (one
// Math.random() shuffle, no seeding) and persists the result immediately.
// Every later call — including from a separate `report` invocation —
// reads the persisted assignment back instead of recomputing it. That's
// the whole mechanism: assign once, reuse forever, no seeded-PRNG
// reconstruction anywhere.
export function establishBlindIdentity(runId: string, usable: RawGeneration[], force: boolean): RunIdentity {
  const keyPath = join(judgedDir(runId), "blinding-key.json")
  let keyFile: BlindingKeyEntry[]
  if (fileExists(keyPath) && !force) {
    keyFile = readJson<BlindingKeyEntry[]>(keyPath)
  } else {
    const shuffled = [...usable]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    keyFile = shuffled.map((g, i) => ({ outId: `OUT-${String(i + 1).padStart(2, "0")}`, topicId: g.topicId, arm: g.arm, index: g.index }))
    writeJson(keyPath, keyFile)
  }
  const outIdToGen = new Map<string, RawGeneration>()
  for (const entry of keyFile) {
    const g = usable.find((gg) => gg.topicId === entry.topicId && gg.arm === entry.arm && gg.index === entry.index)
    if (g) outIdToGen.set(entry.outId, g)
  }
  return { keyFile, outIdToGen }
}

const SURPRISE_INSTRUCTIONS =
  'Score every generation AFTER the first within its session (same sessionId), based on whether it feels like a genuinely new idea relative to everything earlier in that same session. Sessions are topic/arm groups, but which arm produced a session is intentionally not shown — do not try to infer or guess it while scoring. Fill in each null "score" field with 0, 1, or 2. Do not fill in a score for generationIndex 1 (nothing precedes it).'

// Builds (once, persisted) the one surprise-scoring worksheet: real
// generation order within each (topic, arm) group ("session"), session
// presentation order randomized so same-topic sessions aren't shown back-
// to-back, arm identity never written into the file at all — report.ts
// recovers each output's arm from blinding-key.json when it needs it,
// so the worksheet itself doesn't need to carry that information.
export function establishSurpriseWorksheet(
  runId: string,
  topics: TopicSpec[],
  arms: string[],
  reps: number,
  identity: RunIdentity,
  force: boolean
): SurpriseWorksheet {
  const path = join(judgedDir(runId), "surprise-worksheet.json")
  if (fileExists(path) && !force) return readJson<SurpriseWorksheet>(path)

  interface Group {
    topicId: string
    arm: string
    outIds: string[]
  }
  const groups: Group[] = []
  for (const topic of topics) {
    for (const arm of arms) {
      const outIds = Array.from({ length: reps }, (_, i) => {
        const entry = identity.keyFile.find((k) => k.topicId === topic.id && k.arm === arm && k.index === i + 1)
        if (!entry) throw new Error(`Missing generation for ${topic.id}/${arm}/${i + 1} while building the surprise worksheet`)
        return entry.outId
      })
      groups.push({ topicId: topic.id, arm, outIds })
    }
  }
  for (let i = groups.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[groups[i], groups[j]] = [groups[j], groups[i]]
  }

  const worksheet: SurpriseWorksheet = {
    instructions: SURPRISE_INSTRUCTIONS,
    scoreRubric: {
      "0": "Same underlying idea as something already seen in this session",
      "1": "Meaningfully different from anything seen so far, but predictable — the kind of alternate take you'd expect",
      "2": "Genuinely new direction — not just a different take, one you wouldn't have anticipated from the topic + prior generations in this session",
    },
    sessions: groups.map((g, i) => ({
      sessionId: `SESSION-${String(i + 1).padStart(2, "0")}`,
      topicText: topics.find((t) => t.id === g.topicId)?.text ?? g.topicId,
      generations: g.outIds.map((outId, idx) => {
        const gen = identity.outIdToGen.get(outId)!
        return idx === 0
          ? { generationIndex: 1, outId, tweetText: gen.rawOutput! }
          : { generationIndex: idx + 1, outId, tweetText: gen.rawOutput!, score: null }
      }),
    })),
  }
  writeJson(path, worksheet)
  return worksheet
}
