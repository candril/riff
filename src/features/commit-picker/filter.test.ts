import { test, expect, describe } from "bun:test"
import { markedCommits, getFilteredCommits } from "./filter"
import { createInitialState, openCommitPicker, setViewingCommit, toggleCommitMark, type AppState } from "../../state"
import type { PrCommit } from "../../providers/github/types"

// Newest first, as both providers report them.
const commits: PrCommit[] = [
  { sha: "aaa1111", message: "the last thing", author: "you", date: "2026-09-11T10:00:00Z" },
  { sha: "bbb2222", message: "the middle of it", author: "you", date: "2026-09-11T09:00:00Z" },
  { sha: "ccc3333", message: "where it started", author: "you", date: "2026-09-11T08:00:00Z" },
  { sha: "ddd4444", message: "something else", author: "you", date: "2026-09-11T07:00:00Z" },
]

function base(): AppState {
  return { ...createInitialState([], [], "local", "local changes"), commits }
}

/** Row 0 is "all commits", so a commit's row is its index + 1. */
function onRow(state: AppState, row: number): AppState {
  return { ...state, commitPicker: { ...state.commitPicker, selectedIndex: row + 1 } }
}

describe("marking commits", () => {
  test("space marks one, and marks it back off", () => {
    const marked = toggleCommitMark(onRow(openCommitPicker(base()), 1), "bbb2222")
    expect(markedCommits(marked)).toEqual(["bbb2222"])
    expect(markedCommits(toggleCommitMark(marked, "bbb2222"))).toEqual([])
  })

  test("marks come back newest first, whatever order they were picked in", () => {
    const state = toggleCommitMark(toggleCommitMark(openCommitPicker(base()), "ccc3333"), "aaa1111")

    expect(markedCommits(state)).toEqual(["aaa1111", "ccc3333"])
  })

  test("reopening shows what is already in scope", () => {
    const scoped = setViewingCommit(
      { ...base(), commitDiffCache: new Map([["bbb2222+ccc3333", { files: [], fileTree: [] }]]) },
      "bbb2222",
      ["bbb2222", "ccc3333"],
    )

    const reopened = openCommitPicker(scoped)

    expect(markedCommits(reopened)).toEqual(["bbb2222", "ccc3333"])
    // And the cursor starts on the first of them rather than at the top.
    expect(reopened.commitPicker.selectedIndex).toBe(2)
  })
})

describe("what the filter narrows", () => {
  test("the query still matches message, sha and author", () => {
    const state = { ...openCommitPicker(base()), commitPicker: { ...openCommitPicker(base()).commitPicker, query: "middle" } }

    expect(getFilteredCommits(state).map((row) => row.commit.sha)).toEqual(["bbb2222"])
  })
})
