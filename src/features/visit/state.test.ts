import { describe, expect, test } from "bun:test"
import { createVisitWatermark } from "../../utils/visit"
import { createVisitState } from "./state"

const watermark = createVisitWatermark("abc")

const begun = () => {
  const visit = createVisitState()
  visit.begin(watermark, false)
  return visit
}

describe("createVisitState", () => {
  test("starts with no watermark, nothing seen, not rebased and no files changed", () => {
    const visit = createVisitState()
    expect(visit.watermark()).toBeNull()
    expect(visit.seen().size).toBe(0)
    expect(visit.rebased()).toBe(false)
    expect(visit.changedFiles().size).toBe(0)
  })

  test("markSeen without a watermark changes nothing", () => {
    const visit = createVisitState()
    const before = visit.seen()
    visit.markSeen(["c1"])
    expect(visit.seen()).toBe(before)
    expect(visit.seen().size).toBe(0)
  })

  test("markSeen adds the ids to a new set", () => {
    const visit = begun()
    const before = visit.seen()
    visit.markSeen(["c1", "c2"])
    visit.markSeen(["c2", "c3"])
    expect([...visit.seen()]).toEqual(["c1", "c2", "c3"])
    expect(visit.seen()).not.toBe(before)
  })

  test("markSeen of ids already seen keeps the same set", () => {
    const visit = begun()
    visit.markSeen(["c1"])
    const before = visit.seen()
    visit.markSeen(["c1"])
    visit.markSeen([])
    expect(visit.seen()).toBe(before)
  })

  test("setChangedFiles takes the files", () => {
    const visit = begun()
    visit.setChangedFiles(new Set(["a.ts"]))
    expect([...visit.changedFiles()]).toEqual(["a.ts"])
  })

  test("begin takes the watermark and rebased flag, and clears seen and changed files", () => {
    const visit = begun()
    visit.markSeen(["c1"])
    visit.setChangedFiles(new Set(["a.ts"]))
    const next = createVisitWatermark("def")
    visit.begin(next, true)
    expect(visit.watermark()).toBe(next)
    expect(visit.rebased()).toBe(true)
    expect(visit.seen().size).toBe(0)
    expect(visit.changedFiles().size).toBe(0)
  })

  test("reset drops the watermark and everything found since", () => {
    const visit = createVisitState()
    visit.begin(watermark, true)
    visit.markSeen(["c1"])
    visit.setChangedFiles(new Set(["a.ts"]))
    visit.reset()
    expect(visit.watermark()).toBeNull()
    expect(visit.rebased()).toBe(false)
    expect(visit.seen().size).toBe(0)
    expect(visit.changedFiles().size).toBe(0)
  })
})
