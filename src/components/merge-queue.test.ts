import { describe, expect, test } from "bun:test"
import type { PrMergeQueue, PrMergeQueueEntry } from "../providers/github/types"
import { formatEta, queuePoint } from "./merge-queue"

const NOW = Date.parse("2026-03-01T12:00:00Z")
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString()

const entry = (over: Partial<PrMergeQueueEntry> = {}): PrMergeQueueEntry => ({
  position: 3,
  total: 7,
  state: "AWAITING_CHECKS",
  etaSeconds: 720,
  enqueuedAt: ago(20),
  enqueuer: "alice",
  ...over,
})
const queued = (over: Partial<PrMergeQueueEntry> = {}): PrMergeQueue => ({ entry: entry(over), removal: null })
const IDLE: PrMergeQueue = { entry: null, removal: null }

const point = (queue: PrMergeQueue | null | undefined, ready = true) => queuePoint(queue, { ready, now: NOW })

describe("queuePoint", () => {
  test("is no line at all when the base has no queue", () => {
    expect(point(null)).toBeNull()
    expect(point(undefined)).toBeNull()
  })

  test("not queued says merging adds it only when nothing else holds the merge", () => {
    expect(point(IDLE)).toEqual({ id: "queue", state: "idle", text: "not queued · merging adds it" })
    expect(point(IDLE, false)).toEqual({ id: "queue", state: "idle", text: "not queued" })
  })

  test("queued reads position, state, eta and who added it", () => {
    expect(point(queued())).toEqual({
      id: "queue",
      state: "queued",
      text: "#3 of 7 · awaiting checks · ~12m · added by alice 20m ago",
    })
  })

  test("every waiting state is queued, a mergeable one is merging", () => {
    expect(point(queued({ state: "QUEUED" }))).toMatchObject({ state: "queued", text: expect.stringContaining("· queued ·") })
    expect(point(queued({ state: "LOCKED" }))).toMatchObject({ state: "queued", text: expect.stringContaining("· locked ·") })
    expect(point(queued({ state: "MERGEABLE" }))).toMatchObject({
      state: "merging",
      text: expect.stringContaining("· mergeable ·"),
    })
  })

  test("a queued line holds whatever the rest of the verdict is", () => {
    expect(point(queued(), false)?.state).toBe("queued")
  })

  test("leaves out each part whose datum is missing", () => {
    expect(point(queued({ etaSeconds: null }))?.text).toBe("#3 of 7 · awaiting checks · added by alice 20m ago")
    expect(point(queued({ total: null }))?.text).toBe("#3 · awaiting checks · ~12m · added by alice 20m ago")
    expect(point(queued({ enqueuer: null }))?.text).toBe("#3 of 7 · awaiting checks · ~12m · added 20m ago")
    expect(point(queued({ enqueuedAt: null }))?.text).toBe("#3 of 7 · awaiting checks · ~12m · added by alice")
    expect(point(queued({ enqueuedAt: null, enqueuer: null }))?.text).toBe("#3 of 7 · awaiting checks · ~12m")
  })

  test("an entry added this minute was added just now", () => {
    expect(point(queued({ enqueuedAt: ago(0) }))?.text).toEndWith("added by alice just now")
  })

  test("an unmergeable entry fails", () => {
    expect(point(queued({ state: "UNMERGEABLE" }))).toEqual({ id: "queue", state: "fail", text: "unmergeable" })
  })

  test("a removal fails with GitHub's reason, lowercased", () => {
    const removed = (reason: string): PrMergeQueue => ({ entry: null, removal: { reason, at: ago(5) } })
    expect(point(removed("Failed status checks"))).toEqual({
      id: "queue",
      state: "fail",
      text: "removed · failed status checks",
    })
    expect(point(removed(""))).toEqual({ id: "queue", state: "fail", text: "removed" })
  })
})

describe("formatEta", () => {
  test("rounds up to minutes, and reads hours past the hour", () => {
    expect(formatEta(59)).toBe("~1m")
    expect(formatEta(720)).toBe("~12m")
    expect(formatEta(3900)).toBe("~1h 5m")
    expect(formatEta(3600)).toBe("~1h")
  })
})
