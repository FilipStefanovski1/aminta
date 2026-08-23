// Generic OpenAI-compatible chat call. Used by OpenRouter and Groq.

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } }

export interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: string | ContentPart[]
}

// Default for a single tweet/reply/polish generation. Thread Creator asks
// for 3 developed thread options in one response and needs far more room —
// see THREAD_MAX_TOKENS below and lib/backendGenerate.ts's call site. A
// fixed 400 here regardless of task was silently truncating thread JSON
// mid-response once posts were asked to be developed (Medium-depth fix),
// producing invalid JSON that failed to parse — not a distinctness
// rejection, an output-budget bug.
const DEFAULT_MAX_TOKENS = 400

export async function callOpenAICompat(
  endpoint: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  label: string,
  maxTokens: number = DEFAULT_MAX_TOKENS
): Promise<string> {
  if (!apiKey.trim()) {
    throw new Error(`Missing API key. Add your ${label} key in Settings.`)
  }

  let res: Response
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.9,
        max_tokens: maxTokens
      }),
      signal: AbortSignal.timeout(60_000)
    })
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") {
      throw new Error(`${label} took too long to respond. Try again, or pick a faster model in Settings.`)
    }
    throw new Error("Network error. Check your internet connection.")
  }

  if (!res.ok) {
    let detail = ""
    try {
      const err = await res.json()
      detail = err?.error?.message ?? ""
    } catch {
      // ignore parse failure
    }
    if (res.status === 401) {
      throw new Error(`Invalid API key (401). Check your ${label} key in Settings.`)
    }
    if (res.status === 402) {
      throw new Error("Out of credits (402). Add credits to your account.")
    }
    if (res.status === 429) {
      throw new Error(
        `Rate limited (429). ${detail || "Wait a moment and try again."}`
      )
    }
    throw new Error(`${label} error ${res.status}. ${detail}`.trim())
  }

  const data = await res.json()
  const text = data?.choices?.[0]?.message?.content?.trim()
  if (!text) {
    throw new Error("Empty response from the model. Try again or pick another model.")
  }
  return text
}

export function callOpenRouter(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  maxTokens?: number
): Promise<string> {
  return callOpenAICompat(
    "https://openrouter.ai/api/v1/chat/completions",
    apiKey,
    model,
    messages,
    "OpenRouter",
    maxTokens
  )
}

export function callGroq(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  maxTokens?: number
): Promise<string> {
  return callOpenAICompat(
    "https://api.groq.com/openai/v1/chat/completions",
    apiKey,
    model,
    messages,
    "Groq",
    maxTokens
  )
}
