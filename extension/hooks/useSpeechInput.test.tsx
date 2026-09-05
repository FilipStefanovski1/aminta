// @vitest-environment jsdom
//
// Speech-to-text behavior, driven entirely through a fake SpeechRecognition
// — no real microphone, no audio, no hardware dependency. What matters and
// is asserted here: transcripts APPEND (never replace), interim results are
// never committed, an unsupported browser degrades to "no mic UI" rather
// than a broken control, and a denied permission surfaces as readable copy
// while typing keeps working.
import { act } from "react-dom/test-utils"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useState } from "react"
import { useSpeechInput } from "~hooks/useSpeechInput"
import { appendTranscript } from "~lib/personalContext"

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

interface FakeResult { isFinal: boolean; 0: { transcript: string } }

class FakeRecognition {
  static last: FakeRecognition | null = null
  static startThrows = false
  continuous = false
  interimResults = false
  lang = ""
  started = false
  stopped = false
  onresult: ((e: { resultIndex: number; results: { length: number; [i: number]: FakeResult } }) => void) | null = null
  onerror: ((e: { error?: string }) => void) | null = null
  onend: (() => void) | null = null

  constructor() { FakeRecognition.last = this }
  start() {
    if (FakeRecognition.startThrows) throw new Error("start failed")
    this.started = true
  }
  stop() { this.stopped = true; this.onend?.() }

  /** Emits one recognition result, final or interim. */
  emit(transcript: string, isFinal: boolean) {
    const results = { length: 1, 0: { isFinal, 0: { transcript } } } as unknown as { length: number; [i: number]: FakeResult }
    this.onresult?.({ resultIndex: 0, results })
  }
  fail(code: string) { this.onerror?.({ error: code }) }
}

// A minimal host component: mirrors exactly how PersonalContextField wires
// the hook — chunks are appended to existing text, never assigned over it.
function Harness({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial)
  const speech = useSpeechInput((chunk) => setValue((v) => appendTranscript(v, chunk)))
  return (
    <div>
      <textarea readOnly value={value} data-testid="field" />
      <span data-testid="supported">{String(speech.supported)}</span>
      <span data-testid="listening">{String(speech.listening)}</span>
      <span data-testid="error">{speech.error}</span>
      <button onClick={speech.toggle}>toggle</button>
    </div>
  )
}

let container: HTMLDivElement
let root: Root

const field = () => container.querySelector<HTMLTextAreaElement>('[data-testid="field"]')!.value
const readState = (id: string) => container.querySelector(`[data-testid="${id}"]`)!.textContent
const toggle = () => act(() => {
  container.querySelector("button")!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
})

beforeEach(() => {
  FakeRecognition.last = null
  FakeRecognition.startThrows = false
  ;(window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition = FakeRecognition
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
  delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition
  vi.restoreAllMocks()
})

describe("useSpeechInput", () => {
  it("reports supported when the browser exposes a speech API", () => {
    act(() => root.render(<Harness />))
    expect(readState("supported")).toBe("true")
  })

  it("reports unsupported (so callers can hide the mic) when there is no speech API", () => {
    delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
    act(() => root.render(<Harness />))
    expect(readState("supported")).toBe("false")
  })

  it("appends a final transcript to text the user already typed, never replacing it", () => {
    act(() => root.render(<Harness initial="I already typed this." />))
    toggle()
    act(() => FakeRecognition.last!.emit("and then I said this out loud", true))
    expect(field()).toBe("I already typed this. and then I said this out loud")
  })

  it("appends each additional chunk, keeping everything before it", () => {
    act(() => root.render(<Harness />))
    toggle()
    act(() => FakeRecognition.last!.emit("first sentence.", true))
    act(() => FakeRecognition.last!.emit("second sentence.", true))
    expect(field()).toBe("first sentence. second sentence.")
  })

  it("never commits interim results — only final ones reach the field", () => {
    act(() => root.render(<Harness />))
    toggle()
    act(() => FakeRecognition.last!.emit("half a thou", false))
    expect(field()).toBe("")
    act(() => FakeRecognition.last!.emit("half a thought finished", true))
    expect(field()).toBe("half a thought finished")
  })

  it("requests continuous recognition with the browser's own language", () => {
    vi.stubGlobal("navigator", { ...navigator, language: "en-GB" })
    act(() => root.render(<Harness />))
    toggle()
    expect(FakeRecognition.last!.continuous).toBe(true)
    expect(FakeRecognition.last!.interimResults).toBe(true)
    expect(FakeRecognition.last!.lang).toBe("en-GB")
  })

  it("toggles listening on and off, and stopping ends the session", () => {
    act(() => root.render(<Harness />))
    toggle()
    expect(readState("listening")).toBe("true")
    toggle()
    expect(FakeRecognition.last!.stopped).toBe(true)
    expect(readState("listening")).toBe("false")
  })

  it("a denied microphone shows readable guidance and stops listening — never a raw error code", () => {
    act(() => root.render(<Harness initial="typed text survives" />))
    toggle()
    act(() => FakeRecognition.last!.fail("not-allowed"))
    expect(readState("listening")).toBe("false")
    expect(readState("error")).toContain("Microphone access is off")
    expect(readState("error")).not.toContain("not-allowed")
    // The field is untouched — typing always keeps working.
    expect(field()).toBe("typed text survives")
  })

  it("missing microphone hardware degrades to a typing hint", () => {
    act(() => root.render(<Harness />))
    toggle()
    act(() => FakeRecognition.last!.fail("audio-capture"))
    expect(readState("error")).toContain("No microphone found")
  })

  it("a user-initiated abort is silent — no error copy for a normal stop", () => {
    act(() => root.render(<Harness />))
    toggle()
    act(() => FakeRecognition.last!.fail("aborted"))
    expect(readState("error")).toBe("")
    expect(readState("listening")).toBe("false")
  })

  it("a start() that throws surfaces a fallback message instead of breaking the field", () => {
    FakeRecognition.startThrows = true
    act(() => root.render(<Harness />))
    toggle()
    expect(readState("listening")).toBe("false")
    expect(readState("error")).toContain("You can type instead")
  })

  it("stops the microphone when the screen unmounts", () => {
    act(() => root.render(<Harness />))
    toggle()
    const rec = FakeRecognition.last!
    act(() => root.unmount())
    expect(rec.stopped).toBe(true)
    // Re-mount for the shared afterEach teardown.
    root = createRoot(container)
  })
})
