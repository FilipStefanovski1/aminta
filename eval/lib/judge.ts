import { callGenerationProvider } from "./providers.ts"

// Judging now runs on the same configured EVAL_PROVIDER as generation
// (passed in by run-pilot.ts, not owned here) so the framework only ever
// needs one credential — the one for whichever provider is selected. This
// means judging inherits that provider's production-fixed temperature/
// token settings via callGenerationProvider() rather than a separately
// tunable low-temperature config; that's the accepted tradeoff of reusing
// the production callers unmodified instead of adding judge-specific
// configuration.

// ─── Clustering — one call per topic, directly on raw tweets (no separate
// premise-extraction step) ──────────────────────────────────────────────

export interface ClusterInput {
  outId: string
  tweetText: string
}

export async function clusterTopic(provider: string, items: ClusterInput[]): Promise<string[][]> {
  const system =
    "You group short social-media posts into clusters of the same underlying idea. Be strict: only group posts that express genuinely the same claim, opinion, or observation — not merely the same broad topic."
  const listing = items.map((it) => `${it.outId}: """${it.tweetText}"""`).join("\n\n")
  const user = `Here are ${items.length} posts, all written about the same topic:\n\n${listing}\n\nGroup them into clusters where every post in a cluster expresses the same underlying idea/premise. A cluster can have just one member if nothing else matches it. Return ONLY a JSON array of arrays of the IDs, e.g. [["OUT-01","OUT-05"],["OUT-02"]]. Every ID listed above must appear exactly once across all clusters — no ID may be dropped or duplicated.`
  const { text } = await callGenerationProvider(provider, system, user)
  return parseClusters(text, items.map((i) => i.outId))
}

function parseClusters(raw: string, expectedIds: string[]): string[][] {
  const match = raw.match(/\[[\s\S]*\]/)
  if (!match) throw new Error(`Clustering response wasn't parseable JSON:\n${raw}`)
  let parsed: string[][]
  try {
    parsed = JSON.parse(match[0])
  } catch (e) {
    throw new Error(`Clustering response had malformed JSON: ${(e as Error).message}\n${raw}`)
  }
  const flat = parsed.flat()
  const seen = new Set(flat)
  const missing = expectedIds.filter((id) => !seen.has(id))
  const extra = flat.filter((id) => !expectedIds.includes(id))
  const dupes = flat.filter((id, i) => flat.indexOf(id) !== i)
  if (missing.length > 0 || extra.length > 0 || dupes.length > 0) {
    // Fail loudly rather than silently correcting — a dropped/duplicated
    // ID would quietly bias the distinct-premise ratio, and that must
    // never happen unnoticed in a report used to make a real decision.
    throw new Error(
      `Clustering ID mismatch. Missing: [${missing.join(", ")}]. Unexpected: [${extra.join(", ")}]. Duplicated: [${[...new Set(dupes)].join(", ")}]. Raw: ${raw}`
    )
  }
  return parsed
}

// ─── Postability — one call per output, the only quality dimension ─────

export async function scorePostability(provider: string, outId: string, topicText: string, tweetText: string): Promise<number> {
  const system =
    'You are a strict, consistent judge of exactly one thing: would a real person actually post this, unedited, as their own words? Score 1-10. 1 = no one would post this (incoherent, off-topic, robotic, or embarrassing). 10 = completely natural — exactly what a real person would post. Do not score anything else — not relevance, not humor, not originality, only "would this actually get posted."'
  const user = `Topic: """${topicText}"""\nPost: """${tweetText}"""\n\nReturn ONLY JSON: {"postability": <1-10>}`
  const { text } = await callGenerationProvider(provider, system, user)
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error(`Postability response for ${outId} wasn't parseable JSON:\n${text}`)
  let parsed: { postability: number }
  try {
    parsed = JSON.parse(match[0])
  } catch (e) {
    throw new Error(`Postability response for ${outId} had malformed JSON: ${(e as Error).message}\n${text}`)
  }
  if (typeof parsed.postability !== "number" || parsed.postability < 1 || parsed.postability > 10) {
    throw new Error(`Postability response for ${outId} has invalid value: ${JSON.stringify(parsed.postability)}`)
  }
  return parsed.postability
}
