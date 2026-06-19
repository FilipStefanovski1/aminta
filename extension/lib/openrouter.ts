// Generic OpenAI-compatible chat call. Used by OpenRouter and Groq.

export interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: string
}

export async function callOpenAICompat(
  endpoint: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  label: string
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
        max_tokens: 400
      })
    })
  } catch {
    throw new Error("Network error — check your internet connection.")
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
  messages: ChatMessage[]
): Promise<string> {
  return callOpenAICompat(
    "https://openrouter.ai/api/v1/chat/completions",
    apiKey,
    model,
    messages,
    "OpenRouter"
  )
}

export function callGroq(
  apiKey: string,
  model: string,
  messages: ChatMessage[]
): Promise<string> {
  return callOpenAICompat(
    "https://api.groq.com/openai/v1/chat/completions",
    apiKey,
    model,
    messages,
    "Groq"
  )
}
