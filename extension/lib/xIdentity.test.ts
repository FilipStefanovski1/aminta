import { describe, expect, it } from "vitest"

import {
  getConnectedXIdentity,
  getProductIdentity,
  normalizeXUsername,
  xIdentitiesMatch,
} from "~lib/xIdentity"

describe("normalizeXUsername", () => {
  it("lowercases, strips a leading @, and trims", () => {
    expect(normalizeXUsername("  @FilipLesterr ")).toBe("filiplesterr")
  })
  it("returns null for empty/nullish input", () => {
    expect(normalizeXUsername("")).toBeNull()
    expect(normalizeXUsername(null)).toBeNull()
    expect(normalizeXUsername(undefined)).toBeNull()
  })
})

describe("getConnectedXIdentity", () => {
  it("returns null when Aminta has no X connection", () => {
    expect(getConnectedXIdentity({ xConnected: false, xUsername: "filiplesterr" })).toBeNull()
    expect(getConnectedXIdentity({ xConnected: true, xUsername: "" })).toBeNull()
  })
  it("returns the username when connected", () => {
    expect(getConnectedXIdentity({ xConnected: true, xUsername: "filiplesterr" })).toEqual({ username: "filiplesterr" })
  })
})

describe("xIdentitiesMatch", () => {
  it("matches on stable user id when both sides have one", () => {
    expect(xIdentitiesMatch({ userId: "123", username: "a" }, { userId: "123", username: "b" })).toBe(true)
  })
  it("blocks on different stable ids even if usernames match", () => {
    expect(xIdentitiesMatch({ userId: "123", username: "same" }, { userId: "456", username: "same" })).toBe(false)
  })
  it("falls back to normalized username when a stable id is unavailable", () => {
    expect(xIdentitiesMatch({ username: "FilipLesterr" }, { username: "@filiplesterr" })).toBe(true)
  })
  it("blocks when normalized usernames differ", () => {
    expect(xIdentitiesMatch({ username: "filiplesterr" }, { username: "differentaccount" })).toBe(false)
  })
  it("blocks when the active identity is unavailable", () => {
    expect(xIdentitiesMatch({ username: "filiplesterr" }, null)).toBe(false)
  })
  it("blocks when the connected identity is unavailable", () => {
    expect(xIdentitiesMatch(null, { username: "filiplesterr" })).toBe(false)
  })
})

describe("getProductIdentity", () => {
  it("prefers the connected X identity when one exists", () => {
    const id = getProductIdentity(
      { xConnected: true, xUsername: "filiplesterr", xDisplayName: "Filip", xAvatarUrl: "https://x.example/avatar.png" },
      "someone@example.com"
    )
    expect(id).toEqual({
      displayName: "Filip",
      handle: "@filiplesterr",
      avatarUrl: "https://x.example/avatar.png",
      usingXIdentity: true,
    })
  })

  it("falls back to the X handle as display name when no display name is cached", () => {
    const id = getProductIdentity(
      { xConnected: true, xUsername: "filiplesterr", xDisplayName: "", xAvatarUrl: "" },
      "someone@example.com"
    )
    expect(id.displayName).toBe("filiplesterr")
    expect(id.avatarUrl).toBeNull()
  })

  it("falls back to email — never fabricates an X handle or avatar — when there's no X connection", () => {
    const id = getProductIdentity(
      { xConnected: false, xUsername: "", xDisplayName: "", xAvatarUrl: "" },
      "someone@example.com"
    )
    expect(id).toEqual({
      displayName: "someone@example.com",
      handle: null,
      avatarUrl: null,
      usingXIdentity: false,
    })
  })

  it("falls back to a generic label when neither X nor email is available", () => {
    const id = getProductIdentity({ xConnected: false, xUsername: "", xDisplayName: "", xAvatarUrl: "" }, null)
    expect(id.displayName).toBe("Your account")
    expect(id.usingXIdentity).toBe(false)
  })
})
