// Shared shapes for the evaluation runner. Trimmed to exactly what V1
// uses — no Provider union (Gemini only), no PersonaId (one hardcoded
// persona), no multi-dimension quality score (postability only).

export interface TopicSpec {
  id: string
  text: string
}

export interface RawGeneration {
  key: string // `${topicId}::${arm}::${index}`
  topicId: string
  arm: string
  index: number // 1-based rep index
  model: string
  systemPrompt: string
  userPrompt: string
  rawOutput: string | null
  latencyMs: number | null
  timestamp: string
  error: string | null
}

export interface BlindingKeyEntry {
  outId: string
  topicId: string
  arm: string
  index: number
}

export interface SurpriseWorksheetGeneration {
  generationIndex: number
  outId: string
  tweetText: string
  score?: number | null // absent for generationIndex 1; null until the human fills it in
}

export interface SurpriseWorksheetSession {
  sessionId: string
  topicText: string
  generations: SurpriseWorksheetGeneration[]
}

export interface SurpriseWorksheet {
  instructions: string
  scoreRubric: { "0": string; "1": string; "2": string }
  sessions: SurpriseWorksheetSession[]
}
