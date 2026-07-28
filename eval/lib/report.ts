import type { BlindingKeyEntry, RawGeneration, SurpriseWorksheet, TopicSpec } from "./types.ts"

export interface ReportInput {
  topics: TopicSpec[]
  arms: string[]
  reps: number
  model: string
  keyFile: BlindingKeyEntry[]
  outIdToGen: Map<string, RawGeneration>
  clusters: Record<string, string[][]> // topicId -> clusters of outId
  postability: Map<string, number> // outId -> 1-10
  worksheet: SurpriseWorksheet
}

function mean(nums: number[]): number {
  const clean = nums.filter((n) => Number.isFinite(n))
  return clean.length === 0 ? NaN : clean.reduce((a, b) => a + b, 0) / clean.length
}

function buildClusterOf(clusters: Record<string, string[][]>): Map<string, number> {
  const m = new Map<string, number>()
  for (const arr of Object.values(clusters)) arr.forEach((members, i) => members.forEach((id) => m.set(id, i)))
  return m
}

function buildSurpriseScoreMap(worksheet: SurpriseWorksheet): Map<string, number | null> {
  const m = new Map<string, number | null>()
  for (const s of worksheet.sessions) {
    for (const g of s.generations) {
      if ("score" in g) m.set(g.outId, g.score ?? null)
    }
  }
  return m
}

function distinctRatio(outIds: string[], clusterOf: Map<string, number>, upTo: number): number {
  const slice = outIds.slice(0, upTo)
  return new Set(slice.map((id) => clusterOf.get(id))).size / slice.length
}

function timeToFirstRepeat(outIds: string[], clusterOf: Map<string, number>): number | null {
  const seen = new Set<number>()
  for (let i = 0; i < outIds.length; i++) {
    const c = clusterOf.get(outIds[i])
    if (c === undefined) throw new Error(`No cluster assignment for ${outIds[i]}`)
    if (seen.has(c)) return i + 1
    seen.add(c)
  }
  return null
}

interface TopicArmRow {
  topicId: string
  arm: string
  outIdsInOrder: string[]
  distinctRatioFirst5: number
  distinctRatioFull: number
  first5DistinctCount: number
  timeToFirstRepeat: number | null
  meanSurprise2to5: number
  meanPostability: number
}

function computeRows(input: ReportInput): TopicArmRow[] {
  const clusterOf = buildClusterOf(input.clusters)
  const surpriseByOutId = buildSurpriseScoreMap(input.worksheet)
  const rows: TopicArmRow[] = []

  for (const topic of input.topics) {
    for (const arm of input.arms) {
      const outIdsInOrder = Array.from({ length: input.reps }, (_, i) => {
        const entry = input.keyFile.find((k) => k.topicId === topic.id && k.arm === arm && k.index === i + 1)
        if (!entry) throw new Error(`Missing blind id for ${topic.id}/${arm}/${i + 1}`)
        return entry.outId
      })

      const distinctRatioFirst5 = distinctRatio(outIdsInOrder, clusterOf, Math.min(5, outIdsInOrder.length))
      const distinctRatioFull = distinctRatio(outIdsInOrder, clusterOf, outIdsInOrder.length)
      const first5DistinctCount = new Set(outIdsInOrder.slice(0, 5).map((id) => clusterOf.get(id))).size
      const ttfr = timeToFirstRepeat(outIdsInOrder, clusterOf)

      const surpriseValues = outIdsInOrder
        .slice(1, 5) // generations 2-5
        .map((id) => surpriseByOutId.get(id))
        .filter((s): s is number => typeof s === "number")
      const meanSurprise2to5 = mean(surpriseValues)

      const meanPostabilityVal = mean(outIdsInOrder.map((id) => input.postability.get(id)!))

      rows.push({
        topicId: topic.id,
        arm,
        outIdsInOrder,
        distinctRatioFirst5,
        distinctRatioFull,
        first5DistinctCount,
        timeToFirstRepeat: ttfr,
        meanSurprise2to5,
        meanPostability: meanPostabilityVal,
      })
    }
  }
  return rows
}

function rowsFor(rows: TopicArmRow[], arm: string): TopicArmRow[] {
  return rows.filter((r) => r.arm === arm)
}

interface Criterion {
  criterion: string
  threshold: string
  value: string
  pass: boolean
}

// Provisional success criteria, frozen per premise-diversity-methodology's
// design discussion — measured on Arm C, generations 1-5, averaged across
// the 4 pilot topics.
function evaluateCriteria(rows: TopicArmRow[]): Criterion[] {
  const armC = rowsFor(rows, "C")
  const armA = rowsFor(rows, "A")
  const armB = rowsFor(rows, "B")

  const avgDistinct = mean(armC.map((r) => r.distinctRatioFirst5))
  const avgFirst5 = mean(armC.map((r) => r.first5DistinctCount))
  const avgSurprise = mean(armC.map((r) => r.meanSurprise2to5))

  let worstMargin = Infinity // most-negative (worst) (C - best-of-A/B) postability gap across topics
  for (const c of armC) {
    const a = armA.find((r) => r.topicId === c.topicId)
    const b = armB.find((r) => r.topicId === c.topicId)
    const best = Math.max(a?.meanPostability ?? -Infinity, b?.meanPostability ?? -Infinity)
    worstMargin = Math.min(worstMargin, c.meanPostability - best)
  }

  return [
    {
      criterion: "Distinct-premise ratio (generations 1-5), avg across topics",
      threshold: "≥ 0.75",
      value: avgDistinct.toFixed(2),
      pass: avgDistinct >= 0.75,
    },
    {
      criterion: "First-5 distinct-premise count, avg across topics",
      threshold: "≥ 4 of 5",
      value: avgFirst5.toFixed(2),
      pass: avgFirst5 >= 4,
    },
    {
      criterion: "Average surprise score (generations 2-5)",
      threshold: "≥ 1.25",
      value: avgSurprise.toFixed(2),
      pass: avgSurprise >= 1.25,
    },
    {
      criterion: "Postability vs. best of Arm A/B, worst topic",
      threshold: "no more than 0.5 below",
      value: worstMargin === Infinity ? "n/a" : worstMargin.toFixed(2),
      pass: worstMargin >= -0.5,
    },
  ]
}

interface AmbiguityFlag {
  condition: string
  triggered: boolean
  detail: string
}

function evaluateAmbiguity(rows: TopicArmRow[]): AmbiguityFlag[] {
  const armC = rowsFor(rows, "C")

  const marginTopics = armC.filter((r) => r.distinctRatioFirst5 >= 0.65 && r.distinctRatioFirst5 <= 0.85).map((r) => r.topicId)
  const marginCondition: AmbiguityFlag = {
    condition: "Margin — distinct-premise ratio within 0.10 of the 0.75 threshold",
    triggered: marginTopics.length > 0,
    detail: marginTopics.length > 0 ? `Topics in the 0.65–0.85 band: ${marginTopics.join(", ")}` : "None.",
  }

  const diversityPass = (r: TopicArmRow) => r.distinctRatioFirst5 >= 0.75 && r.first5DistinctCount >= 4 && r.meanSurprise2to5 >= 1.25
  const postabilityPassForTopic = (topicId: string) => {
    const c = armC.find((r) => r.topicId === topicId)!
    const a = rowsFor(rows, "A").find((r) => r.topicId === topicId)
    const b = rowsFor(rows, "B").find((r) => r.topicId === topicId)
    const best = Math.max(a?.meanPostability ?? -Infinity, b?.meanPostability ?? -Infinity)
    return c.meanPostability - best >= -0.5
  }
  const splitTopics = armC.filter((r) => diversityPass(r) !== postabilityPassForTopic(r.topicId)).map((r) => r.topicId)
  const splitCondition: AmbiguityFlag = {
    condition: "Split — a topic passes diversity but fails the postability guardrail, or vice versa",
    triggered: splitTopics.length > 0,
    detail: splitTopics.length > 0 ? `Topics: ${splitTopics.join(", ")}` : "None.",
  }

  const outcomes = armC.map(diversityPass)
  const inconsistent = new Set(outcomes).size > 1
  const crossTopicCondition: AmbiguityFlag = {
    condition: "Cross-topic inconsistency — diversity outcome doesn't agree across all pilot topics",
    triggered: inconsistent,
    detail: armC.map((r) => `${r.topicId}=${diversityPass(r) ? "pass" : "fail"}`).join(", "),
  }

  return [marginCondition, splitCondition, crossTopicCondition]
}

type Verdict = "Ship Arm C" | "Do not ship Arm C" | "Inconclusive, expand the evaluation"

function computeRecommendation(
  criteria: Criterion[],
  ambiguity: AmbiguityFlag[],
  rows: TopicArmRow[]
): { verdict: Verdict; paragraph: string } {
  const armC = rowsFor(rows, "C")
  const armB = rowsFor(rows, "B")
  const avgDistinctC = mean(armC.map((r) => r.distinctRatioFirst5))
  const avgDistinctB = mean(armB.map((r) => r.distinctRatioFirst5))
  const avgPostC = mean(armC.map((r) => r.meanPostability))
  const avgPostB = mean(armB.map((r) => r.meanPostability))

  if (ambiguity.some((a) => a.triggered)) {
    return {
      verdict: "Inconclusive, expand the evaluation",
      paragraph: `At least one ambiguity condition triggered (see below) — this pilot's ${rows.length / 3}-topic, ${armC[0]?.outIdsInOrder.length ?? "?"}-generation-per-arm sample isn't decisive on its own. Arm C's distinct-premise ratio averaged ${avgDistinctC.toFixed(2)} vs. Arm B's ${avgDistinctB.toFixed(2)} (the currently-shipped random-angle mechanism), and postability averaged ${avgPostC.toFixed(1)}/10 vs. Arm B's ${avgPostB.toFixed(1)}/10 — directionally suggestive but not enough to decide from. Expand to a larger run before committing either way.`,
    }
  }

  if (criteria.every((c) => c.pass)) {
    return {
      verdict: "Ship Arm C",
      paragraph: `Premise-first planning improved the distinct-premise ratio from ${avgDistinctB.toFixed(2)} (Arm B) to ${avgDistinctC.toFixed(2)} (Arm C), while postability held at ${avgPostC.toFixed(1)}/10 versus Arm B's ${avgPostB.toFixed(1)}/10 — diversity improved without a meaningful quality cost. All success criteria passed with no ambiguity condition triggered.`,
    }
  }

  const failed = criteria.filter((c) => !c.pass).map((c) => c.criterion)
  return {
    verdict: "Do not ship Arm C",
    paragraph: `${failed.join("; ")} did not clear the pre-registered threshold. Arm C's distinct-premise ratio averaged ${avgDistinctC.toFixed(2)} vs. Arm B's ${avgDistinctB.toFixed(2)}, and postability averaged ${avgPostC.toFixed(1)}/10 vs. Arm B's ${avgPostB.toFixed(1)}/10 — either the diversity gain didn't materialize, or it came at a real quality cost. Rework the premise-selection approach before re-testing, rather than building the full pipeline on this evidence.`,
  }
}

function metricsTable(rows: TopicArmRow[]): string {
  const header =
    "| Topic | Arm | Distinct ratio (1-5) | Distinct ratio (full) | First-5 distinct | Time to first repeat | Mean surprise (2-5) | Mean postability |\n" +
    "|---|---|---|---|---|---|---|---|"
  const lines = rows.map(
    (r) =>
      `| ${r.topicId} | ${r.arm} | ${r.distinctRatioFirst5.toFixed(2)} | ${r.distinctRatioFull.toFixed(2)} | ${r.first5DistinctCount}/5 | ${r.timeToFirstRepeat ?? "none"} | ${Number.isFinite(r.meanSurprise2to5) ? r.meanSurprise2to5.toFixed(2) : "n/a"} | ${r.meanPostability.toFixed(1)} |`
  )
  return [header, ...lines].join("\n")
}

function criteriaTable(criteria: Criterion[]): string {
  const header = "| Criterion | Threshold | Arm C value | Result |\n|---|---|---|---|"
  const lines = criteria.map((c) => `| ${c.criterion} | ${c.threshold} | ${c.value} | ${c.pass ? "✅ PASS" : "❌ FAIL"} |`)
  return [header, ...lines].join("\n")
}

function ambiguityTable(flags: AmbiguityFlag[]): string {
  const header = "| Condition | Triggered | Detail |\n|---|---|---|"
  const lines = flags.map((f) => `| ${f.condition} | ${f.triggered ? "⚠️ YES" : "no"} | ${f.detail} |`)
  return [header, ...lines].join("\n")
}

function evidenceAppendix(input: ReportInput): string {
  const clusterOf = buildClusterOf(input.clusters)
  return input.topics
    .map((topic) => {
      const lines = [`### ${topic.id} — "${topic.text}"`, ""]
      for (const arm of input.arms) {
        lines.push(`**Arm ${arm}**`, "")
        for (let index = 1; index <= input.reps; index++) {
          const entry = input.keyFile.find((k) => k.topicId === topic.id && k.arm === arm && k.index === index)!
          const gen = input.outIdToGen.get(entry.outId)!
          const cluster = clusterOf.get(entry.outId)
          const post = input.postability.get(entry.outId)
          lines.push(`${index}. (cluster ${cluster}, postability ${post}) ${gen.rawOutput}`)
        }
        lines.push("")
      }
      return lines.join("\n")
    })
    .join("\n")
}

export function renderReport(input: ReportInput): string {
  const rows = computeRows(input)
  const criteria = evaluateCriteria(rows)
  const ambiguity = evaluateAmbiguity(rows)
  const { verdict, paragraph } = computeRecommendation(criteria, ambiguity, rows)

  return `# Premise Diversity Pilot — Report

Generation model: ${input.model}

## Recommendation

**${verdict}**

${paragraph}

---

## Per-arm/topic metrics

${metricsTable(rows)}

---

## Success criteria (Arm C)

${criteriaTable(criteria)}

---

## Ambiguity conditions

${ambiguityTable(ambiguity)}

---

## Evidence — every raw generation, grouped by topic and arm

${evidenceAppendix(input)}
`
}
