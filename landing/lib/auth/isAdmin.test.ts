import { afterEach, describe, expect, it } from "vitest"
import { isAdminEmail } from "./isAdmin"

const ORIGINAL = process.env.ADMIN_EMAILS

afterEach(() => {
  process.env.ADMIN_EMAILS = ORIGINAL
})

describe("isAdminEmail", () => {
  it("matches an email in the allowlist", () => {
    process.env.ADMIN_EMAILS = "a@x.com,b@x.com"
    expect(isAdminEmail("a@x.com")).toBe(true)
    expect(isAdminEmail("b@x.com")).toBe(true)
  })

  it("is case-insensitive and trims whitespace around list entries", () => {
    process.env.ADMIN_EMAILS = " Admin@X.com , other@x.com "
    expect(isAdminEmail("admin@x.com")).toBe(true)
    expect(isAdminEmail("ADMIN@X.COM")).toBe(true)
  })

  it("rejects an email not in the allowlist", () => {
    process.env.ADMIN_EMAILS = "a@x.com"
    expect(isAdminEmail("stranger@x.com")).toBe(false)
  })

  it("rejects everything when ADMIN_EMAILS is unset or empty", () => {
    delete process.env.ADMIN_EMAILS
    expect(isAdminEmail("a@x.com")).toBe(false)
    process.env.ADMIN_EMAILS = ""
    expect(isAdminEmail("a@x.com")).toBe(false)
  })

  it("rejects null/undefined without throwing", () => {
    process.env.ADMIN_EMAILS = "a@x.com"
    expect(isAdminEmail(null)).toBe(false)
    expect(isAdminEmail(undefined)).toBe(false)
  })
})
