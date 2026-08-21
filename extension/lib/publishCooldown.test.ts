import { describe, expect, it } from "vitest"
import { cooldownSecondsRemaining, PUBLISH_COOLDOWN_MS } from "~lib/publishCooldown"

describe("cooldownSecondsRemaining", () => {
  it("is 0 when no cooldown is set", () => {
    expect(cooldownSecondsRemaining(null, Date.now())).toBe(0)
  })

  it("is ~15 right after a confirmed publish", () => {
    const now = Date.now()
    expect(cooldownSecondsRemaining(now + PUBLISH_COOLDOWN_MS, now)).toBe(15)
  })

  it("counts down and expires at exactly the deadline", () => {
    const now = Date.now()
    const until = now + 3000
    expect(cooldownSecondsRemaining(until, now)).toBe(3)
    expect(cooldownSecondsRemaining(until, now + 3000)).toBe(0)
    expect(cooldownSecondsRemaining(until, now + 3001)).toBe(0)
  })

  it("never goes negative", () => {
    expect(cooldownSecondsRemaining(Date.now() - 5000, Date.now())).toBe(0)
  })
})
