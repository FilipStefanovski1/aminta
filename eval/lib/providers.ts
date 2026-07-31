// One responsibility: call whichever provider EVAL_PROVIDER (top of
// run-pilot.ts) selects. Both generation and judging (judge.ts) call
// through the same callGenerationProvider() below — the framework only
// ever needs the one credential for the configured EVAL_PROVIDER,
// nothing else.
//
// Reuses extension/lib/gemini.ts's callGemini() and extension/lib/
// openrouter.ts's callGroq()/callOpenRouter() directly (not
// reimplemented), so calls exercise the exact same request shape, model
// defaults, and fixed temperature/token settings production actually
// sends — including for judging, which now runs on the same provider and
// inherits those same fixed settings rather than a separately-tunable
// low-temperature config, since reusing the production callers (not
// reimplementing them) is the point.

import { callGemini as productionCallGemini } from "../../extension/lib/gemini.ts"
import { callGroq as productionCallGroq, callOpenRouter as productionCallOpenRouter } from "../../extension/lib/openrouter.ts"
import type { ChatMessage } from "../../extension/lib/openrouter.ts"

// Deliberately separate from production's env vars (landing/.env.local's
// GEMINI_API_KEY, the extension's BYOK key) — this tool never reads or
// shares product credentials.
function requireApiKey(envVar: string): string {
  const key = process.env[envVar]
  if (!key) {
    throw new Error(
      `Missing ${envVar}. Export it in your shell before running — never pass it as a CLI flag (it would leak into shell history / process listings).`
    )
  }
  return key
}

// Accepted provider strings — kept next to the dispatch logic that
// interprets them, not next to the EVAL_PROVIDER constant itself (that
// constant lives at the top of run-pilot.ts, deliberately, for
// discoverability):
//   "gemini"                → extension/lib/gemini.ts's callGemini(), production's default model
//   "groq"                  → extension/lib/openrouter.ts's callGroq(), production's default model
//   "openrouter:<model-id>" → extension/lib/openrouter.ts's callOpenRouter() with that model

// Mirrors extension/lib/ai.ts's GEMINI_DEFAULT/GROQ_DEFAULT — copied as
// literal constants (not imported) since ai.ts itself uses Plasmo's
// "~lib/..." import alias internally, which only resolves inside the
// extension's bundler, not under plain Node. gemini.ts and openrouter.ts
// below have no such aliased imports (gemini.ts's one import is type-only
// and erased at runtime), so those two are imported directly.
const GEMINI_DEFAULT_MODEL = "gemini-3.5-flash"
const GROQ_DEFAULT_MODEL = "llama-3.3-70b-versatile"

export interface GenerationCallResult {
  text: string
  latencyMs: number
  model: string
}

// `provider` is passed in by the caller (run-pilot.ts's EVAL_PROVIDER,
// threaded through into judge.ts's calls too) rather than read from a
// constant owned by this file — this file has no opinion on which
// provider a run benchmarks, and only requires the one credential for
// whichever provider is actually passed in.
export async function callGenerationProvider(provider: string, systemPrompt: string, userPrompt: string): Promise<GenerationCallResult> {
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]
  const start = Date.now()
  let text: string
  let model: string

  if (provider === "gemini") {
    model = GEMINI_DEFAULT_MODEL
    text = await productionCallGemini(requireApiKey("EVAL_GEMINI_API_KEY"), model, messages)
  } else if (provider === "groq") {
    model = GROQ_DEFAULT_MODEL
    text = await productionCallGroq(requireApiKey("EVAL_GROQ_API_KEY"), model, messages)
  } else if (provider.startsWith("openrouter:")) {
    model = provider.slice("openrouter:".length)
    text = await productionCallOpenRouter(requireApiKey("EVAL_OPENROUTER_API_KEY"), model, messages)
  } else {
    throw new Error(`Unrecognized provider "${provider}" (from EVAL_PROVIDER at the top of run-pilot.ts). Use "gemini", "groq", or "openrouter:<model-id>".`)
  }

  return { text, latencyMs: Date.now() - start, model }
}
