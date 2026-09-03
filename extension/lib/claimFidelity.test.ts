import { describe, expect, it } from "vitest"
import { buildFidelityCheckMessages, describeViolation, parseFidelityResult, type FidelityViolation } from "./claimFidelity"

describe("buildFidelityCheckMessages", () => {
  it("embeds SOURCE and GENERATED DRAFT verbatim", () => {
    const messages = buildFidelityCheckMessages("i think solana might do well", [], "solana could genuinely do well")
    const user = messages.find((m) => m.role === "user")!.content as string
    expect(user).toContain("i think solana might do well")
    expect(user).toContain("solana could genuinely do well")
  })

  it("includes a VERIFIED FACTS block when facts are present", () => {
    const messages = buildFidelityCheckMessages("Solana Summit Serbia", ["Hosted at the Sava Congress Center in Belgrade."], "draft text")
    const user = messages.find((m) => m.role === "user")!.content as string
    expect(user).toContain("VERIFIED FACTS")
    expect(user).toContain("Sava Congress Center")
  })

  it("omits the VERIFIED FACTS block entirely when there are no facts", () => {
    const messages = buildFidelityCheckMessages("some input", [], "draft text")
    const user = messages.find((m) => m.role === "user")!.content as string
    expect(user).not.toContain("VERIFIED FACTS")
  })

  it("the system message asks for meaning-only comparison, not quality", () => {
    const messages = buildFidelityCheckMessages("x", [], "y")
    const system = messages.find((m) => m.role === "system")!.content as string
    expect(system).toContain("did the MEANING change")
    expect(system).toContain("not judging quality")
  })

  it("names every violation dimension the v2.2 spec requires", () => {
    const system = buildFidelityCheckMessages("x", [], "y").find((m) => m.role === "system")!.content as string
    for (const term of ["certainty", "tense/time", "scope", "sentiment intensity", "negation", "numbers or counts", "personal experience", "objective fact"]) {
      expect(system.toLowerCase()).toContain(term.toLowerCase())
    }
  })
})

describe("parseFidelityResult — happy paths", () => {
  it("parses a clean faithful verdict", () => {
    const result = parseFidelityResult('{ "faithful": true, "violations": [] }')
    expect(result).toEqual({ faithful: true, violations: [] })
  })

  it("parses a verdict with violations and derives faithful=false from the violations list itself", () => {
    const raw = JSON.stringify({
      faithful: false,
      violations: [
        { type: "certainty_escalation", sourceClaim: "i think it might work", generatedClaim: "it will work", explanation: "hedge dropped" },
      ],
    })
    const result = parseFidelityResult(raw)
    expect(result.faithful).toBe(false)
    expect(result.violations).toHaveLength(1)
    expect(result.violations[0]).toEqual({
      type: "certainty_escalation",
      sourceClaim: "i think it might work",
      generatedClaim: "it will work",
      explanation: "hedge dropped",
    })
  })

  it("strips a markdown code fence a model added despite instructions", () => {
    const raw = '```json\n{ "faithful": true, "violations": [] }\n```'
    expect(parseFidelityResult(raw)).toEqual({ faithful: true, violations: [] })
  })

  it("strips a bare ``` fence with no language tag", () => {
    const raw = '```\n{ "faithful": true, "violations": [] }\n```'
    expect(parseFidelityResult(raw)).toEqual({ faithful: true, violations: [] })
  })

  it("derives faithful purely from the violations array — a self-contradictory faithful:true with real violations is still treated as NOT faithful", () => {
    const raw = JSON.stringify({
      faithful: true, // self-contradictory — should not be trusted
      violations: [{ type: "temporal_shift", sourceClaim: "a", generatedClaim: "b", explanation: "c" }],
    })
    expect(parseFidelityResult(raw).faithful).toBe(false)
  })
})

describe("parseFidelityResult — malformed/adversarial responses fail OPEN", () => {
  it("garbage text that isn't JSON at all", () => {
    expect(parseFidelityResult("not json at all, sorry")).toEqual({ faithful: true, violations: [] })
  })

  it("empty string", () => {
    expect(parseFidelityResult("")).toEqual({ faithful: true, violations: [] })
  })

  it("valid JSON but not an object (a bare array)", () => {
    expect(parseFidelityResult("[1,2,3]").faithful).toBe(true)
  })

  it("valid JSON object with violations as a non-array — treated as no violations", () => {
    expect(parseFidelityResult('{ "faithful": false, "violations": "yes" }')).toEqual({ faithful: true, violations: [] })
  })

  it("a violation entry that's missing fields gets safe empty-string defaults rather than throwing", () => {
    const raw = JSON.stringify({ faithful: false, violations: [{ type: "scope_expansion" }] })
    const result = parseFidelityResult(raw)
    expect(result.violations[0]).toEqual({ type: "scope_expansion", sourceClaim: "", generatedClaim: "", explanation: "" })
  })

  it("an unrecognized violation `type` is coerced to invented_claim, never silently dropped", () => {
    const raw = JSON.stringify({ faithful: false, violations: [{ type: "some_new_category_the_model_made_up", sourceClaim: "a", generatedClaim: "b", explanation: "c" }] })
    const result = parseFidelityResult(raw)
    expect(result.violations).toHaveLength(1)
    expect(result.violations[0].type).toBe("invented_claim")
  })

  it("a violations array containing a non-object entry skips just that entry", () => {
    const raw = JSON.stringify({ faithful: false, violations: [null, "oops", { type: "contradiction", sourceClaim: "a", generatedClaim: "b", explanation: "c" }] })
    const result = parseFidelityResult(raw)
    expect(result.violations).toHaveLength(1)
    expect(result.violations[0].type).toBe("contradiction")
  })
})

describe("describeViolation", () => {
  it("formats a full violation with type, claims, and explanation", () => {
    const v: FidelityViolation = {
      type: "temporal_shift",
      sourceClaim: "is going to dominate",
      generatedClaim: "has already won",
      explanation: "future prediction became an accomplished fact",
    }
    const desc = describeViolation(v)
    expect(desc).toContain("temporal shift")
    expect(desc).toContain("is going to dominate")
    expect(desc).toContain("has already won")
    expect(desc).toContain("future prediction became an accomplished fact")
  })

  it("degrades gracefully when claims/explanation are empty", () => {
    const desc = describeViolation({ type: "invented_claim", sourceClaim: "", generatedClaim: "", explanation: "" })
    expect(desc).toBe("invented claim")
  })
})
