import { describe, it, expect, beforeEach, vi } from "vitest"
import { CONTENT_TTL_MS, USAGE_LOG_RETENTION_DAYS } from "@/lib/ai/retention"

// Records every query the route builds so we can assert the two
// ai_usage_log operations are genuinely different: a content-only scrub and
// a whole-row delete on separate clocks.
interface Recorded {
  table: string
  op: "delete" | "update"
  payload?: Record<string, unknown>
  filters: { kind: string; column: string; value: unknown }[]
}

let recorded: Recorded[] = []

function queryBuilder(table: string) {
  const make = (op: "delete" | "update", payload?: Record<string, unknown>) => {
    const entry: Recorded = { table, op, payload, filters: [] }
    recorded.push(entry)
    const chain = {
      lt(column: string, value: unknown) {
        entry.filters.push({ kind: "lt", column, value })
        return chain
      },
      not(column: string, operator: string, value: unknown) {
        entry.filters.push({ kind: `not.${operator}`, column, value })
        return chain
      },
      then(resolve: (v: { error: null }) => unknown) {
        return Promise.resolve({ error: null }).then(resolve)
      },
    }
    return chain
  }
  return {
    delete: () => make("delete"),
    update: (payload: Record<string, unknown>) => make("update", payload),
  }
}

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: async () => ({ from: (table: string) => queryBuilder(table) }),
}))

const { GET } = await import("./route")

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.parse("2026-08-12T12:00:00.000Z")

function request(auth?: string) {
  return {
    headers: { get: (n: string) => (n.toLowerCase() === "authorization" ? auth ?? null : null) },
  } as unknown as Parameters<typeof GET>[0]
}

const usageLogOps = () => recorded.filter((r) => r.table === "ai_usage_log")

beforeEach(() => {
  recorded = []
  process.env.CRON_SECRET = "test-secret"
  vi.setSystemTime(NOW)
})

describe("cleanup cron", () => {
  it("rejects callers without the shared secret", async () => {
    const res = await GET(request("Bearer wrong"))
    expect(res.status).toBe(401)
    expect(recorded).toHaveLength(0)
  })

  it("scrubs generated content on the short TTL, separately from record deletion", async () => {
    await GET(request("Bearer test-secret"))

    const scrub = usageLogOps().find((r) => r.op === "update")
    expect(scrub).toBeDefined()

    // Only result_text is touched — no other column is written, so every
    // non-content operational field survives the scrub.
    expect(scrub!.payload).toEqual({ result_text: null })
    expect(Object.keys(scrub!.payload!)).toEqual(["result_text"])

    const cutoff = scrub!.filters.find((f) => f.kind === "lt" && f.column === "created_at")
    expect(cutoff!.value).toBe(new Date(NOW - CONTENT_TTL_MS).toISOString())

    // Rows already scrubbed are skipped so the sweep is a cheap no-op.
    expect(scrub!.filters.some((f) => f.kind === "not.is" && f.column === "result_text")).toBe(true)
  })

  it("still deletes whole records on the unchanged 90-day retention", async () => {
    await GET(request("Bearer test-secret"))

    const del = usageLogOps().find((r) => r.op === "delete")
    expect(del).toBeDefined()
    expect(del!.payload).toBeUndefined()

    const cutoff = del!.filters.find((f) => f.kind === "lt" && f.column === "created_at")
    expect(cutoff!.value).toBe(new Date(NOW - USAGE_LOG_RETENTION_DAYS * DAY).toISOString())
  })

  it("uses two different cutoffs — content goes long before the record does", async () => {
    await GET(request("Bearer test-secret"))

    const scrubAt = usageLogOps().find((r) => r.op === "update")!.filters[0].value as string
    const deleteAt = usageLogOps().find((r) => r.op === "delete")!.filters[0].value as string

    expect(scrubAt).not.toBe(deleteAt)
    expect(Date.parse(deleteAt)).toBeLessThan(Date.parse(scrubAt))
  })

  it("keeps sweeping the other operational tables", async () => {
    await GET(request("Bearer test-secret"))
    expect(recorded.some((r) => r.table === "ai_rate_limit_counters" && r.op === "delete")).toBe(true)
    expect(recorded.some((r) => r.table === "ai_inflight_requests" && r.op === "delete")).toBe(true)
  })
})
