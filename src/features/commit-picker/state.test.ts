import { describe, expect, test } from "bun:test"
import type { PrCommit } from "../../providers/github/types"
import { createCommitPickerState } from "./state"

// Newest first, as both providers report them.
const commits: PrCommit[] = [
  { sha: "aaa1111", message: "the last thing", author: "you", date: "2026-09-11T10:00:00Z" },
  { sha: "bbb2222", message: "the middle of it", author: "you", date: "2026-09-11T09:00:00Z" },
  { sha: "ccc3333", message: "where it started", author: "you", date: "2026-09-11T08:00:00Z" },
]

function opened(scope: readonly string[] | null = null) {
  const commitPicker = createCommitPickerState()
  commitPicker.show(scope, commits)
  return commitPicker
}

describe("the commit picker's state", () => {
  test("opens on all commits, with nothing marked, when nothing is in scope", () => {
    const commitPicker = opened()
    expect(commitPicker.open()).toBe(true)
    expect(commitPicker.snapshot()).toEqual({
      query: "",
      queryInput: false,
      selectedIndex: 0,
      marked: new Set(),
      rangeAnchor: null,
    })
  })

  test("opens on the scope's marks, with the cursor on the first of them", () => {
    const commitPicker = opened(["ccc3333", "bbb2222"])
    expect([...commitPicker.marked()].sort()).toEqual(["bbb2222", "ccc3333"])
    expect(commitPicker.selectedIndex()).toBe(2)
    expect(commitPicker.markedBeforeRange()).toEqual(commitPicker.marked())
  })

  test("reopening drops the query and the run left behind", () => {
    const commitPicker = opened()
    commitPicker.startFilter()
    commitPicker.setQuery("mid")
    commitPicker.toggleRange("bbb2222")
    commitPicker.show(null, commits)
    expect(commitPicker.snapshot()).toEqual({
      query: "",
      queryInput: false,
      selectedIndex: 0,
      marked: new Set(),
      rangeAnchor: null,
    })
  })

  test("the selection wraps at both ends", () => {
    const commitPicker = opened()
    commitPicker.move(-1, 3)
    expect(commitPicker.selectedIndex()).toBe(3)
    commitPicker.move(1, 3)
    expect(commitPicker.selectedIndex()).toBe(0)
  })

  test("a new query lands on the first match and drops the run, keeping the marks", () => {
    const commitPicker = opened()
    commitPicker.toggleRange("aaa1111")
    commitPicker.markRange(["aaa1111", "bbb2222"])
    commitPicker.setQuery("x")
    expect(commitPicker.selectedIndex()).toBe(1)
    expect(commitPicker.rangeAnchor()).toBeNull()
    expect([...commitPicker.marked()]).toEqual(["aaa1111", "bbb2222"])
    expect(commitPicker.markedBeforeRange()).toEqual(commitPicker.marked())
  })

  test("space marks a commit, and marks it back off", () => {
    const commitPicker = opened()
    commitPicker.toggleMark("bbb2222")
    expect([...commitPicker.marked()]).toEqual(["bbb2222"])
    commitPicker.toggleMark("bbb2222")
    expect([...commitPicker.marked()]).toEqual([])
  })

  test("V anchors a run, which extends over what was marked before it", () => {
    const commitPicker = opened()
    commitPicker.toggleMark("ccc3333")
    commitPicker.toggleRange("aaa1111")
    expect(commitPicker.rangeAnchor()).toBe("aaa1111")
    expect([...commitPicker.marked()].sort()).toEqual(["aaa1111", "ccc3333"])
    commitPicker.markRange(["aaa1111", "bbb2222"])
    expect([...commitPicker.marked()].sort()).toEqual(["aaa1111", "bbb2222", "ccc3333"])
    commitPicker.markRange(["aaa1111"])
    expect([...commitPicker.marked()].sort()).toEqual(["aaa1111", "ccc3333"])
  })

  test("V again keeps the run, so later runs extend from it", () => {
    const commitPicker = opened()
    commitPicker.toggleRange("aaa1111")
    commitPicker.markRange(["aaa1111", "bbb2222"])
    commitPicker.toggleRange("bbb2222")
    expect(commitPicker.rangeAnchor()).toBeNull()
    expect([...commitPicker.marked()]).toEqual(["aaa1111", "bbb2222"])
    expect(commitPicker.markedBeforeRange()).toEqual(commitPicker.marked())
  })

  test("ending the filter keeps the query or drops it", () => {
    const commitPicker = opened()
    commitPicker.startFilter()
    expect(commitPicker.queryInput()).toBe(true)
    commitPicker.setQuery("mid")
    commitPicker.endFilter(true)
    expect(commitPicker.queryInput()).toBe(false)
    expect(commitPicker.query()).toBe("mid")
    commitPicker.startFilter()
    commitPicker.endFilter(false)
    expect(commitPicker.query()).toBe("")
  })

  test("closing clears the query and the run, and keeps the marks", () => {
    const commitPicker = opened()
    commitPicker.toggleMark("ccc3333")
    commitPicker.toggleRange("aaa1111")
    commitPicker.startFilter()
    commitPicker.close()
    expect(commitPicker.open()).toBe(false)
    expect(commitPicker.query()).toBe("")
    expect(commitPicker.queryInput()).toBe(false)
    expect(commitPicker.rangeAnchor()).toBeNull()
    expect([...commitPicker.marked()].sort()).toEqual(["aaa1111", "ccc3333"])
    expect([...commitPicker.markedBeforeRange()]).toEqual(["ccc3333"])
  })
})
