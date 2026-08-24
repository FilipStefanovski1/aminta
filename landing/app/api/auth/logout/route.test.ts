import { describe, expect, it } from "vitest"
import { isTolerableLogoutError } from "./route"

describe("isTolerableLogoutError", () => {
  it("treats an already-invalid/expired session as a tolerable outcome", () => {
    expect(isTolerableLogoutError(401)).toBe(true)
    expect(isTolerableLogoutError(403)).toBe(true)
  })

  it("treats a genuine failure (service/network error) as intolerable", () => {
    expect(isTolerableLogoutError(500)).toBe(false)
    expect(isTolerableLogoutError(502)).toBe(false)
    expect(isTolerableLogoutError(undefined)).toBe(false)
  })
})
