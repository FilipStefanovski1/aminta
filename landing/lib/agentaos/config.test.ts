import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { linkIdForPlan } from "./config"

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  process.env.AGENTAOS_PRO_LINK_ID = "46e8753f-deb0-4cee-bd0b-7af7d572e130"
  process.env.AGENTAOS_FOUNDER_LINK_ID = "544e4870-b71c-46e9-93d2-bdea9fd474c7"
})
afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe("linkIdForPlan — plan mapping cannot be overridden by client input", () => {
  it("pro resolves only to the Pro link id", () => {
    expect(linkIdForPlan("pro")).toBe("46e8753f-deb0-4cee-bd0b-7af7d572e130")
  })

  it("founder resolves only to the Founder link id", () => {
    expect(linkIdForPlan("founder")).toBe("544e4870-b71c-46e9-93d2-bdea9fd474c7")
  })

  it("the two plans never resolve to the same link id", () => {
    expect(linkIdForPlan("pro")).not.toBe(linkIdForPlan("founder"))
  })

  it("throws rather than checking out against an unconfigured link", () => {
    delete process.env.AGENTAOS_PRO_LINK_ID
    expect(() => linkIdForPlan("pro")).toThrow(/AGENTAOS_PRO_LINK_ID/)
  })
})
