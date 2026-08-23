// @vitest-environment jsdom
//
// Regression suite for the X OAuth production bug: the extension must never
// remain indefinitely on "Connecting to X…" when the website-side OAuth
// flow fails, is cancelled, or never completes. Covers both the ACTIVE
// failure signal (AMINTA_AUTH_ERROR, relayed from /login via
// contents/aminta-auth-bridge.ts -> background.ts — see LoginForm.tsx and
// background.ts) and the 90s stall-timeout fallback that still applies if
// no signal ever arrives (tab closed, bridge not injected, etc.).
import { act } from "react-dom/test-utils"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import LoginScreen from "~components/LoginScreen"

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root
let messageListeners: ((msg: unknown) => void)[] = []
let tabsCreateCalls: { url: string }[] = []

function render() {
  act(() => {
    root.render(<LoginScreen onSignedIn={() => {}} />)
  })
}

function fireAuthError() {
  act(() => {
    messageListeners.forEach((l) => l({ type: "AMINTA_AUTH_ERROR" }))
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  messageListeners = []
  tabsCreateCalls = []
  vi.stubGlobal("chrome", {
    runtime: {
      id: "test-extension-id",
      onMessage: {
        addListener: (fn: (msg: unknown) => void) => messageListeners.push(fn),
        removeListener: (fn: (msg: unknown) => void) => {
          messageListeners = messageListeners.filter((l) => l !== fn)
        },
      },
    },
    tabs: {
      create: (opts: { url: string }) => { tabsCreateCalls.push(opts) },
    },
  })
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => { root.unmount() })
  container.remove()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function click(text: string) {
  const btn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === text)
  if (!btn) throw new Error(`No button with text "${text}" — visible: ${Array.from(container.querySelectorAll("button")).map((b) => b.textContent)}`)
  act(() => { btn.dispatchEvent(new MouseEvent("click", { bubbles: true })) })
}

describe("LoginScreen — never remains stuck on \"Connecting to X…\"", () => {
  it("idle by default, and clicking Connect opens the login tab and starts waiting", () => {
    render()
    expect(container.textContent).toContain("Connect")
    click("Connect")

    expect(tabsCreateCalls).toHaveLength(1)
    expect(tabsCreateCalls[0].url).toContain("/login?ext_id=test-extension-id")
    expect(container.textContent).toContain("Connecting to X")
  })

  it("user cancels: Cancel works, stops the spinner, and Try again is offered", () => {
    render()
    click("Connect")
    expect(container.textContent).toContain("Connecting to X")

    click("Cancel")

    expect(container.textContent).not.toContain("Connecting to X")
    expect(container.textContent).toContain("Connection cancelled")
    expect(container.textContent).toContain("Try again")
  })

  it("extension timeout: 90s with no response stops the spinner and offers retry, without needing an explicit failure signal", () => {
    render()
    click("Connect")
    expect(container.textContent).toContain("Connecting to X")

    act(() => { vi.advanceTimersByTime(90_000) })

    expect(container.textContent).not.toContain("Connecting to X")
    expect(container.textContent).toContain("Couldn't connect your X account. Try again.")
  })

  it("does not stall before 90s if nothing has happened yet — still genuinely waiting", () => {
    render()
    click("Connect")
    act(() => { vi.advanceTimersByTime(89_000) })
    expect(container.textContent).toContain("Connecting to X")
  })

  it("provider/code-exchange failure: an active AMINTA_AUTH_ERROR signal ends the wait immediately — no 90s stuck state", () => {
    render()
    click("Connect")
    expect(container.textContent).toContain("Connecting to X")

    // Far short of the 90s fallback — this is the whole point of the fix:
    // the website already knows it failed within seconds, so the extension
    // shouldn't need to wait out the long timeout to find out too.
    act(() => { vi.advanceTimersByTime(2_000) })
    fireAuthError()

    expect(container.textContent).not.toContain("Connecting to X")
    expect(container.textContent).toContain("Couldn't connect your X account. Try again.")
  })

  it("retry after failure succeeds: Try again from the failure state re-opens the login tab and returns to waiting", () => {
    render()
    click("Connect")
    fireAuthError()
    expect(container.textContent).toContain("Try again")
    tabsCreateCalls = []

    click("Try again")

    expect(tabsCreateCalls).toHaveLength(1)
    expect(container.textContent).toContain("Connecting to X")
  })

  it("retry after Cancel also works the same way", () => {
    render()
    click("Connect")
    click("Cancel")
    tabsCreateCalls = []

    click("Try again")

    expect(tabsCreateCalls).toHaveLength(1)
    expect(container.textContent).toContain("Connecting to X")
  })

  it("no permanent stuck state: a late AMINTA_AUTH_ERROR after the user already cancelled is a no-op, not a crash or a stale transition", () => {
    render()
    click("Connect")
    click("Cancel")
    expect(container.textContent).toContain("Connection cancelled")

    // The listener unregisters once state leaves "waiting" — firing after
    // Cancel must not resurrect or corrupt the cancelled state.
    fireAuthError()

    expect(container.textContent).toContain("Connection cancelled")
  })

  it("an AMINTA_AUTH_ERROR received while idle (no build in flight) does nothing", () => {
    render()
    fireAuthError()
    expect(container.textContent).toContain("Connect")
    expect(container.textContent).not.toContain("Try again")
  })
})
