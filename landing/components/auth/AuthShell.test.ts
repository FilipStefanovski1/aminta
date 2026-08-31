import { describe, expect, it } from "vitest"
import { shouldSkipPassiveSessionRestore } from "./AuthShell"

// Regression coverage for the wrong-account "Connect with X" bug:
//
//   x.com = account A
//   amintaapp.com (this browser) = still signed in as account B
//   extension = signed out, user clicks "Connect with X"
//
// The extension opens /login?ext_id=<id> for exactly this reason. Before
// this fix, LoginForm's own "already signed in, skip the form" convenience
// (meant for someone typing amintaapp.com/login into their address bar)
// applied unconditionally, so it silently redirected straight to
// /extension-auth with account B's still-live session — the explicit X
// OAuth flow never ran, and X never got a chance to confirm account A.
describe("shouldSkipPassiveSessionRestore", () => {
  it("skips the passive shortcut when ?ext_id is present — the extension's explicit Connect with X", () => {
    expect(shouldSkipPassiveSessionRestore("?ext_id=abcdefghijklmnopqrstuvwxabcdefgh")).toBe(true)
  })

  it("does NOT skip it for an ordinary website visit with no ext_id — passive restore stays a convenience there", () => {
    expect(shouldSkipPassiveSessionRestore("")).toBe(false)
    expect(shouldSkipPassiveSessionRestore("?mode=create")).toBe(false)
  })

  it("is driven by presence, not truthiness — an empty ext_id value still counts as an explicit extension request", () => {
    expect(shouldSkipPassiveSessionRestore("?ext_id=")).toBe(true)
  })

  it("still works alongside other query params in either order", () => {
    expect(shouldSkipPassiveSessionRestore("?foo=bar&ext_id=xyz")).toBe(true)
    expect(shouldSkipPassiveSessionRestore("?ext_id=xyz&foo=bar")).toBe(true)
  })
})
