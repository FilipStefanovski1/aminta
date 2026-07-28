#!/usr/bin/env node
// Standalone evaluation-harness runner. Never imported by, or importing
// from, extension/ or landing/ — reads/writes only inside eval/. See
// eval/RUNNER.md for usage.
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { ARM_BUILDERS } from "./lib/arms.ts"
import { userMessage } from "./lib/prompt-shared.ts"
import { callGenerationProvider } from "./lib/providers.ts"
import { clusterTopic, scorePostability } from "./lib/judge.ts"
import { establishBlindIdentity, establishSurpriseWorksheet, judgedDir, loadRawGenerations, rawDir, reportPath, runDir } from "./lib/state.ts"
import { fileExists, readJson, sanitizeFilename, writeJson } from "./lib/fsUtil.ts"
import { renderReport } from "./lib/report.ts"
import type { RawGeneration, SurpriseWorksheet, TopicSpec } from "./lib/types.ts"

// ─── EVAL_PROVIDER — which production model this benchmark run generates
// AND judges against (judging reuses the same provider so only one
// credential is ever required). The single source of truth: change this
// one line to benchmark a different provider, nothing else. No registry,
// no CLI flag, no runtime selection. Always benchmark the same provider
// you intend to ship — see RUNNER.md.
//   "gemini"                → extension/lib/gemini.ts's callGemini()
//   "groq"                  → extension/lib/openrouter.ts's callGroq()
//   "openrouter:<model-id>" → extension/lib/openrouter.ts's callOpenRouter(), e.g. "openrouter:grok-4"
const EVAL_PROVIDER = "groq"

// ─── Hardcoded pilot config — nothing here is a CLI flag. Edit these
// constants directly if the pilot itself changes; that's expected to be
// rare, per the frozen architecture. ────────────────────────────────────
const REPS = 6
const ARMS = ["A", "B", "C"]
const TOPICS: TopicSpec[] = readJson(join(import.meta.dirname, "topics", "pilot.json"))

function parseArgs(argv: string[]): { command: "run" | "report"; runId: string; force: boolean } {
  const [command, ...rest] = argv
  if (command !== "run" && command !== "report") {
    throw new Error(
      `First argument must be "run" or "report", got "${command ?? "(none)"}".\n\nUsage:\n  node eval/run-pilot.ts run [--run-id <id>] [--force]\n  node eval/run-pilot.ts report --run-id <id>`
    )
  }
  let runId = "pilot"
  let force = false
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--run-id") {
      runId = rest[i + 1]
      i++
    } else if (rest[i] === "--force") {
      force = true
    } else {
      throw new Error(`Unknown flag "${rest[i]}". Only --run-id and --force are supported.`)
    }
  }
  return { command, runId, force }
}

async function runPhase(runId: string, force: boolean): Promise<void> {
  mkdirSync(rawDir(runId), { recursive: true })
  mkdirSync(judgedDir(runId), { recursive: true })
  console.log(`Run ID: ${runId}\nOutput dir: ${runDir(runId)}\n`)

  let generated = 0
  let skipped = 0
  let failed = 0

  for (const topic of TOPICS) {
    for (const arm of ARMS) {
      for (let index = 1; index <= REPS; index++) {
        const key = `${topic.id}::${arm}::${index}`
        const rawPath = join(rawDir(runId), `${sanitizeFilename(key)}.json`)

        if (fileExists(rawPath) && !force) {
          const existing = readJson<RawGeneration>(rawPath)
          if (existing.rawOutput !== null) {
            skipped++
            continue
          }
          // Previously failed — retry below without needing --force.
        }

        const builder = ARM_BUILDERS[arm]
        if (!builder) throw new Error(`Unknown arm "${arm}"`)
        const systemPrompt = builder()
        const userPrompt = userMessage(topic.text)

        const record: RawGeneration = {
          key,
          topicId: topic.id,
          arm,
          index,
          model: "", // filled in below from the actual provider response
          systemPrompt,
          userPrompt,
          rawOutput: null,
          latencyMs: null,
          timestamp: new Date().toISOString(),
          error: null,
        }

        try {
          const { text, latencyMs, model } = await callGenerationProvider(EVAL_PROVIDER, systemPrompt, userPrompt)
          record.rawOutput = text
          record.latencyMs = latencyMs
          record.model = model
          generated++
          console.log(`OK    ${key}`)
        } catch (e) {
          record.error = (e as Error).message
          failed++
          console.log(`FAIL  ${key} — ${record.error}`)
        }

        writeJson(rawPath, record)
      }
    }
  }

  console.log(`\nGeneration: ${generated} new, ${skipped} already present, ${failed} failed.`)
  if (failed > 0) {
    console.log(`Re-run the same "run" command (no --force needed) to retry just the failed ones.`)
  }

  const expectedTotal = TOPICS.length * ARMS.length * REPS
  const usable = loadRawGenerations(runId).filter((g) => g.rawOutput !== null)
  if (usable.length === 0) {
    console.log("\nNo usable generations yet — nothing to judge.")
    return
  }
  if (usable.length < expectedTotal) {
    console.log(`\n${usable.length}/${expectedTotal} generations succeeded — retry failures (re-run "run") before judging is complete.`)
    return
  }

  const identity = establishBlindIdentity(runId, usable, force)

  // Clustering — one call per topic, resumable per-topic (one file each).
  for (const topic of TOPICS) {
    const clusterPath = join(judgedDir(runId), `cluster__${topic.id}.json`)
    if (fileExists(clusterPath) && !force) {
      console.log(`cluster ${topic.id} (already judged)`)
      continue
    }
    const topicOutIds = [...identity.outIdToGen.entries()].filter(([, g]) => g.topicId === topic.id).map(([outId]) => outId)
    const items = topicOutIds.map((outId) => ({ outId, tweetText: identity.outIdToGen.get(outId)!.rawOutput! }))
    try {
      const clusters = await clusterTopic(EVAL_PROVIDER, items)
      writeJson(clusterPath, { topicId: topic.id, clusters })
      console.log(`cluster ${topic.id} OK`)
    } catch (e) {
      console.log(`cluster ${topic.id} FAILED — ${(e as Error).message}`)
    }
  }

  // Postability — one call per output, resumable per-output (one file each).
  for (const [outId, gen] of identity.outIdToGen) {
    const scorePath = join(judgedDir(runId), `postability__${outId}.json`)
    if (fileExists(scorePath) && !force) continue
    const topicText = TOPICS.find((t) => t.id === gen.topicId)!.text
    try {
      const postability = await scorePostability(EVAL_PROVIDER, outId, topicText, gen.rawOutput!)
      writeJson(scorePath, { outId, postability })
      console.log(`postability ${outId} OK`)
    } catch (e) {
      console.log(`postability ${outId} FAILED — ${(e as Error).message}`)
    }
  }

  establishSurpriseWorksheet(runId, TOPICS, ARMS, REPS, identity, force)

  console.log(
    `\nNext:\n1. Fill in the null "score" fields in ${join(judgedDir(runId), "surprise-worksheet.json")}\n2. Run: node eval/run-pilot.ts report --run-id ${runId}`
  )
}

async function reportPhase(runId: string): Promise<void> {
  if (!existsSync(runDir(runId))) {
    throw new Error(`No run found at ${runDir(runId)} — run "node eval/run-pilot.ts run --run-id ${runId}" first.`)
  }

  const expectedTotal = TOPICS.length * ARMS.length * REPS
  const usable = loadRawGenerations(runId).filter((g) => g.rawOutput !== null)
  if (usable.length < expectedTotal) {
    throw new Error(`Only ${usable.length}/${expectedTotal} generations succeeded — retry with "run" before reporting.`)
  }

  // report must never assign new blind ids — force is always false here,
  // so it only ever reads back what `run` already persisted.
  const identity = establishBlindIdentity(runId, usable, false)

  for (const topic of TOPICS) {
    const p = join(judgedDir(runId), `cluster__${topic.id}.json`)
    if (!fileExists(p)) throw new Error(`Missing judged/cluster__${topic.id}.json — run "run" again to complete judging.`)
  }
  for (const outId of identity.outIdToGen.keys()) {
    const p = join(judgedDir(runId), `postability__${outId}.json`)
    if (!fileExists(p)) throw new Error(`Missing judged/postability__${outId}.json — run "run" again to complete judging.`)
  }

  const clusters: Record<string, string[][]> = {}
  for (const topic of TOPICS) {
    const data = readJson<{ topicId: string; clusters: string[][] }>(join(judgedDir(runId), `cluster__${topic.id}.json`))
    clusters[topic.id] = data.clusters
  }
  const postability = new Map<string, number>()
  for (const outId of identity.outIdToGen.keys()) {
    const data = readJson<{ outId: string; postability: number }>(join(judgedDir(runId), `postability__${outId}.json`))
    postability.set(outId, data.postability)
  }

  const worksheetPath = join(judgedDir(runId), "surprise-worksheet.json")
  if (!fileExists(worksheetPath)) throw new Error(`Missing judged/surprise-worksheet.json — run "run" first.`)
  const worksheet = readJson<SurpriseWorksheet>(worksheetPath)
  const unscored = worksheet.sessions.flatMap((s) => s.generations.filter((g) => "score" in g && g.score === null))
  if (unscored.length > 0) {
    throw new Error(`judged/surprise-worksheet.json still has ${unscored.length} unscored generation(s) — fill in every "score" field before running "report".`)
  }

  const report = renderReport({
    topics: TOPICS,
    arms: ARMS,
    reps: REPS,
    model: usable[0].model, // same model for every generation in a run — EVAL_PROVIDER is fixed per run
    keyFile: identity.keyFile,
    outIdToGen: identity.outIdToGen,
    clusters,
    postability,
    worksheet,
  })

  writeFileSync(reportPath(runId), report, "utf-8")
  console.log(`Report written to ${reportPath(runId)}`)
}

async function main(): Promise<void> {
  const { command, runId, force } = parseArgs(process.argv.slice(2))
  if (command === "run") await runPhase(runId, force)
  else await reportPhase(runId)
}

main().catch((e: Error) => {
  console.error(`\nFAILED: ${e.message}\n`)
  process.exit(1)
})
