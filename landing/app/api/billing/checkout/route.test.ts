import { describe, expect, it } from "vitest"
import { resolvePlanFromBody } from "./route"

describe("resolvePlanFromBody — the only thing ever trusted from the client", () => {
  it("accepts pro and founder", () => {
    expect(resolvePlanFromBody({ plan: "pro" })).toBe("pro")
    expect(resolvePlanFromBody({ plan: "founder" })).toBe("founder")
  })

  it("rejects an arbitrary linkId, price, or userId in the body — those fields are simply ignored", () => {
    expect(resolvePlanFromBody({ plan: "pro", linkId: "some-other-link-id" })).toBe("pro")
    expect(resolvePlanFromBody({ linkId: "544e4870-b71c-46e9-93d2-bdea9fd474c7" })).toBeNull()
    expect(resolvePlanFromBody({ userId: "someone-elses-uuid", plan: "founder" })).toBe("founder")
    expect(resolvePlanFromBody({ price: 0.01, plan: "pro" })).toBe("pro")
  })

  it("rejects an unrecognized plan string", () => {
    expect(resolvePlanFromBody({ plan: "lifetime" })).toBeNull()
    expect(resolvePlanFromBody({ plan: "admin" })).toBeNull()
  })

  it("rejects malformed/empty bodies", () => {
    expect(resolvePlanFromBody(null)).toBeNull()
    expect(resolvePlanFromBody({})).toBeNull()
    expect(resolvePlanFromBody("pro")).toBeNull()
  })
})
