import { test, expect, describe } from "bun:test"
import { markedSpan, inMarkedSpan, getFilteredCommits } from "./input"
import { createInitialState, openCommitPicker, toggleCommitPickerAnchor, type AppState } from "../../state"
import type { PrCommit } from "../../providers/github"

// Newest first, as both providers report them.
const commits: PrCommit[] = [
  { sha: "aaa1111", message: "the last thing", author: "you", date: "2026-09-11T10:00:00Z" },
  { sha: "bbb2222", message: "the middle of it", author: "you", date: "2026-09-11T09:00:00Z" },
  { sha: "ccc3333", message: "where it started", author: "you", date: "2026-09-11T08:00:00Z" },
  { sha: "ddd4444", message: "something else", author: "you", date: "2026-09-11T07:00:00Z" },
]

function picker(anchor: string, cursorRow: number): AppState {
  const open = openCommitPicker({ ...createInitialState([], [], "local", "local changes"), commits })
  const anchored = toggleCommitPickerAnchor(open, anchor)
  // Row 0 is "All commits", so a commit's row is its index + 1.
  return { ...anchored, commitPicker: { ...anchored.commitPicker, selectedIndex: cursorRow + 1 } }
}

describe("marking a span of commits", () => {
  test("the older end is the one further down the list", () => {
    const state = picker("aaa1111", 2)

    expect(markedSpan(state, getFilteredCommits(state))).toEqual({
      oldest: "ccc3333",
      newest: "aaa1111",
    })
  })

  test("and it reads the same marked from the other end", () => {
    const state = picker("ccc3333", 0)

    expect(markedSpan(state, getFilteredCommits(state))).toEqual({
      oldest: "ccc3333",
      newest: "aaa1111",
    })
  })

  test("a span of one is no span — Enter alone already does that", () => {
    const state = picker("bbb2222", 1)

    expect(markedSpan(state, getFilteredCommits(state))).toBeNull()
  })

  test("the rows in between are the ones the picker marks", () => {
    const state = picker("aaa1111", 2)
    const filtered = getFilteredCommits(state)

    expect([0, 1, 2, 3].map((i) => inMarkedSpan(state, filtered, i))).toEqual([
      true,
      true,
      true,
      false,
    ])
  })

  test("an anchor the query filtered away marks nothing", () => {
    const state = picker("ddd4444", 0)
    const narrowed = { ...state, commitPicker: { ...state.commitPicker, query: "middle" } }
    const filtered = getFilteredCommits(narrowed)

    expect(filtered.map((row) => row.commit.sha)).toEqual(["bbb2222"])
    expect(markedSpan(narrowed, filtered)).toBeNull()
  })

  test("nothing anchored, nothing marked", () => {
    const state = openCommitPicker({ ...createInitialState([], [], "local", "local changes"), commits })

    expect(markedSpan(state, getFilteredCommits(state))).toBeNull()
  })
})
