import { describe, expect, test } from "bun:test"
import { createLastRefreshState } from "./last-refresh-state"

describe("createLastRefreshState", () => {
  test("is seeded from the clock", () => {
    expect(createLastRefreshState(() => "2026-01-01T10:00:00Z").at()).toBe("2026-01-01T10:00:00Z")
  })

  test("stamp re-reads the clock", () => {
    let now = "2026-01-01T10:00:00Z"
    const lastRefresh = createLastRefreshState(() => now)
    now = "2026-01-01T11:30:00Z"
    lastRefresh.stamp()
    expect(lastRefresh.at()).toBe("2026-01-01T11:30:00Z")
  })

  test("the default clock gives an ISO timestamp", () => {
    const at = createLastRefreshState().at()
    expect(new Date(at).toISOString()).toBe(at)
  })
})
