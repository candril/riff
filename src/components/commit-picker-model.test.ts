import { describe, test, expect } from "bun:test"
import { commitPickerModel, formatTimeAgo, COMMIT_KEYS, type CommitPickerInput, type FilteredCommit } from "./commit-picker-model"
import type { PrCommit } from "../providers/github"
import { EMPTY_CHANGE } from "../providers/local"
import { theme } from "../theme"

const NOW = new Date("2026-10-17T12:00:00Z")
/** Tall enough that no list here is cut to the terminal. */
const TALL = 60

const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString()

function commit(sha: string, extra: Partial<PrCommit> = {}): PrCommit {
  return { sha, message: `message ${sha}`, author: "octocat", date: minutesAgo(5), ...extra }
}

const commits = (...shas: string[]): FilteredCommit[] => shas.map((sha, index) => ({ commit: commit(sha), index }))

function input(extra: Partial<CommitPickerInput> = {}): CommitPickerInput {
  return {
    commits: commits("aaa", "bbb", "ccc"),
    selectedIndex: 0,
    viewingCommit: null,
    marked: new Set(),
    filtering: false,
    query: "",
    extending: false,
    ...extra,
  }
}

describe("commitPickerModel", () => {
  test("lists All commits first, active while no commit is in view, then each commit", () => {
    const model = commitPickerModel(input(), TALL, NOW)
    expect(model.rows.map((r) => r.id)).toEqual(["all", "commit:0", "commit:1", "commit:2"])
    expect(model.rows[0]).toEqual({ id: "all", selected: true, kind: "all", active: true, labelFg: theme.text, total: "3 commits" })
    expect(model.rows[1]).toEqual({
      id: "commit:0",
      selected: false,
      kind: "commit",
      active: false,
      marked: false,
      sha: "aaa",
      shaFg: theme.yellow,
      message: "message aaa",
      messageFg: theme.subtext1,
      note: null,
      author: "@octocat",
      time: "5m ago",
    })
  })

  test("marks the commit in view active, and colours the selected and the marked ones", () => {
    const rows = commitPickerModel(input({ viewingCommit: "bbb", selectedIndex: 2, marked: new Set(["aaa", "bbb"]) }), TALL, NOW).rows
    expect(rows[0]).toMatchObject({ active: false, labelFg: theme.subtext1 })
    expect(rows[1]).toMatchObject({ marked: true, selected: false, shaFg: theme.peach, messageFg: theme.peach })
    expect(rows[2]).toMatchObject({ active: true, marked: true, selected: true, shaFg: theme.peach, messageFg: theme.peach })
    expect(rows[3]).toMatchObject({ marked: false, selected: false, shaFg: theme.yellow, messageFg: theme.subtext1 })
    const selectedOnly = commitPickerModel(input({ selectedIndex: 3 }), TALL, NOW).rows[3]
    expect(selectedOnly).toMatchObject({ shaFg: theme.peach, messageFg: theme.text })
  })

  test("says when a change is empty", () => {
    const model = commitPickerModel(input({ commits: [{ commit: commit("e", { empty: true }), index: 0 }] }), TALL, NOW)
    expect(model.rows[1]).toMatchObject({ note: EMPTY_CHANGE })
  })

  test("counts the marked commits in the title, and names V's way out while it extends", () => {
    expect(commitPickerModel(input(), TALL, NOW)).toMatchObject({ title: "Select Commit", count: null, hints: ["esc"], keys: COMMIT_KEYS, empty: null })
    expect(commitPickerModel(input({ marked: new Set(["aaa"]), extending: true }), TALL, NOW)).toMatchObject({
      title: "Select Commit  1 marked",
      hints: ["V: stop extending"],
    })
  })

  test("describes the field row as the filter being typed, the accepted query, or how to start one", () => {
    expect(commitPickerModel(input({ filtering: true, query: "fix" }), TALL, NOW)).toMatchObject({ filtering: true })
    expect(commitPickerModel(input({ query: "fix" }), TALL, NOW)).toMatchObject({ filtering: false, fieldText: "/fix", fieldFg: theme.subtext0 })
    expect(commitPickerModel(input(), TALL, NOW)).toMatchObject({ fieldText: "/ to filter", fieldFg: theme.overlay0 })
  })

  test("shows fifteen items at most, and keeps the selection in view past the fifteenth", () => {
    const many = commits(...Array.from({ length: 20 }, (_, i) => `c${i}`))
    const top = commitPickerModel(input({ commits: many }), TALL, NOW)
    expect(top).toMatchObject({ above: 0, below: 6 })
    expect(top.rows).toHaveLength(15)
    const moved = commitPickerModel(input({ commits: many, selectedIndex: 17 }), TALL, NOW)
    expect(moved).toMatchObject({ above: 6, below: 0 })
    expect(moved.rows.find((r) => r.selected)!.id).toBe("commit:16")
  })

  test("keeps to what a short terminal has room for beside the key line", () => {
    const many = commits(...Array.from({ length: 20 }, (_, i) => `c${i}`))
    expect(commitPickerModel(input({ commits: many }), 24, NOW).rows).toHaveLength(13)
  })
})

describe("formatTimeAgo", () => {
  test("reads the age against now", () => {
    expect(formatTimeAgo(minutesAgo(0), NOW)).toBe("now")
    expect(formatTimeAgo(minutesAgo(59), NOW)).toBe("59m ago")
    expect(formatTimeAgo(minutesAgo(60 * 5), NOW)).toBe("5h ago")
    expect(formatTimeAgo(minutesAgo(60 * 24 * 3), NOW)).toBe("3d ago")
    expect(formatTimeAgo(minutesAgo(60 * 24 * 15), NOW)).toBe("2w ago")
  })
})
