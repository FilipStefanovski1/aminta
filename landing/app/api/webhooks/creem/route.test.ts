import { describe, expect, it, vi } from "vitest"
import { resolveAnalyticsId } from "./route"

const UUID = "2e68a0ec-f5c1-4cb2-87da-a56012e0037e"
const EMAIL = "someone@example.com"

describe("resolveAnalyticsId — PostHog never receives an email", () => {
  it("uses the UUID directly when the webhook matched on user id", async () => {
    const lookup = vi.fn()
    expect(await resolveAnalyticsId({ column: "id", value: UUID }, lookup)).toBe(UUID)
    expect(lookup).not.toHaveBeenCalled() // no query needed
  })

  it("looks the UUID up when the webhook matched on email — and returns the UUID, not the email", async () => {
    const lookup = vi.fn().mockResolvedValue(UUID)
    const id = await resolveAnalyticsId({ column: "email", value: EMAIL }, lookup)
    expect(id).toBe(UUID)
    expect(id).not.toBe(EMAIL)
    expect(lookup).toHaveBeenCalledWith("email", EMAIL)
  })

  it("returns null rather than falling back to the email when no user matches", async () => {
    const id = await resolveAnalyticsId({ column: "email", value: EMAIL }, async () => null)
    expect(id).toBeNull()
    expect(id).not.toBe(EMAIL)
  })

  // Billing must never depend on telemetry being able to identify someone:
  // a null id only suppresses the analytics event. The database writes in
  // the route are keyed on userMatch, which is unaffected by this result.
  it("a null id is a normal outcome, not a thrown error — billing continues", async () => {
    await expect(
      resolveAnalyticsId({ column: "email", value: EMAIL }, async () => null)
    ).resolves.toBeNull()
  })
})
