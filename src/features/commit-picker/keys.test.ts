import { test, expect, describe } from "bun:test"
import { createInitialState, type AppState } from "../../state"
import type { PrCommit } from "../../providers/github/types"
import { keymapHarness } from "../../testing/keymap-keys"
import { registerCommitPickerKeys } from "./keys"
import { markedCommits } from "./filter"
import { createCommitPickerState, type CommitPickerState } from "./state"

// Newest first, as both providers report them.
const commits: PrCommit[] = [
  { sha: "aaa1111", message: "the last thing", author: "you", date: "2026-09-11T10:00:00Z" },
  { sha: "bbb2222", message: "the middle of it", author: "you", date: "2026-09-11T09:00:00Z" },
  { sha: "ccc3333", message: "where it started", author: "you", date: "2026-09-11T08:00:00Z" },
  { sha: "ddd4444", message: "something else", author: "you", date: "2026-09-11T07:00:00Z" },
]

const SEQUENCES: Record<string, string> = {
  return: "\r",
  escape: "\x1b",
  up: "\x1b[A",
  down: "\x1b[B",
  space: " ",
  "ctrl+p": "\x10",
  "ctrl+n": "\x0e",
  // Kitty's CSI u: the legacy encodings of these collide with other keys.
  "ctrl+j": "\x1b[106;5u",
  "shift+escape": "\x1b[27;2u",
  "ctrl+return": "\x1b[13;5u",
  "ctrl+v": "\x1b[118;5u",
}

/** Row 0 is "all commits", so a commit's row is its index + 1. */
function onRow(commitPicker: CommitPickerState, row: number) {
  commitPicker.move(row + 1 - commitPicker.selectedIndex(), commits.length)
}

async function harness(setup: (commitPicker: CommitPickerState) => void = () => {}) {
  const state: AppState = { ...createInitialState([], [], "local", "local changes"), commits }
  const commitPicker = createCommitPickerState()
  commitPicker.show(null, commits)
  setup(commitPicker)
  const selected: { sha: string | null; scope?: readonly string[] | null }[] = []
  const { riffKeymap, leftKeys, press: pressSequence } = await keymapHarness()
  registerCommitPickerKeys(riffKeymap, {
    getState: () => state,
    commitPicker,
    render: () => {},
    onCommitSelected: (sha, _filename, scope) => {
      selected.push({ sha, scope })
    },
  })

  /** Whether the picker kept the key from the chain, and whether it prevented it. */
  const press = (name: string, rename?: string) => {
    const before = leftKeys.length
    const key = pressSequence(SEQUENCES[name] ?? name, rename)
    return { kept: leftKeys.length === before, prevented: key.defaultPrevented }
  }
  return { press, selected, picker: commitPicker, marked: () => markedCommits(commits, commitPicker.marked()) }
}

describe("the commit picker's list", () => {
  test("its keys do nothing while it is closed", async () => {
    const h = await harness((picker) => picker.close())
    expect(h.press("j")).toEqual({ kept: false, prevented: false })
    expect(h.press("return")).toEqual({ kept: false, prevented: false })
  })

  test("j, k, the arrows and Ctrl-n/Ctrl-p move the cursor", async () => {
    const h = await harness()
    h.press("j")
    h.press("down")
    h.press("ctrl+n")
    expect(h.picker.selectedIndex()).toBe(3)
    h.press("k")
    h.press("ctrl+p")
    expect(h.picker.selectedIndex()).toBe(1)
    h.press("up")
    expect(h.picker.selectedIndex()).toBe(0)
  })

  test("a modifier held does not change what a key does, as in the chain", async () => {
    const h = await harness()
    expect(h.press("ctrl+j")).toEqual({ kept: true, prevented: true })
    expect(h.picker.selectedIndex()).toBe(1)
    h.press("shift+escape")
    expect(h.picker.open()).toBe(false)
  })

  test("Enter on the first row shows all commits", async () => {
    const h = await harness()
    expect(h.press("return")).toEqual({ kept: true, prevented: true })
    expect(h.selected).toEqual([{ sha: null, scope: undefined }])
    expect(h.picker.open()).toBe(false)
  })

  test("Enter on a commit scopes the diff to it, and so does a key named enter", async () => {
    const h = await harness((picker) => onRow(picker, 1))
    h.press("return", "enter")
    expect(h.selected).toEqual([{ sha: "bbb2222", scope: ["bbb2222"] }])
  })

  test("Enter with commits marked scopes the diff to those, newest first", async () => {
    const h = await harness((picker) => {
      picker.toggleMark("ddd4444")
      picker.toggleMark("bbb2222")
      onRow(picker, 0)
    })
    h.press("return")
    expect(h.selected).toEqual([{ sha: "bbb2222", scope: ["bbb2222", "ddd4444"] }])
  })

  test("Enter with no commit under the cursor does nothing, and still takes the key", async () => {
    const h = await harness((picker) => picker.setQuery("nothing matches this"))
    expect(h.press("return")).toEqual({ kept: true, prevented: true })
    expect(h.selected).toEqual([])
    expect(h.picker.open()).toBe(true)
  })

  test("space marks the commit under the cursor", async () => {
    const h = await harness((picker) => onRow(picker, 2))
    expect(h.press("space")).toEqual({ kept: true, prevented: true })
    expect(h.marked()).toEqual(["ccc3333"])
  })

  test("V anchors a run on the commit under the cursor, and j drags it along", async () => {
    const h = await harness((picker) => onRow(picker, 0))
    expect(h.press("V")).toEqual({ kept: true, prevented: true })
    expect(h.marked()).toEqual(["aaa1111"])
    h.press("j")
    h.press("j")
    expect(h.marked()).toEqual(["aaa1111", "bbb2222", "ccc3333"])
  })

  test("V again keeps the run and lets the cursor leave it", async () => {
    const h = await harness((picker) => {
      onRow(picker, 0)
      picker.toggleRange("aaa1111")
    })
    h.press("j")
    h.press("V")
    h.press("j")
    h.press("j")
    expect(h.marked()).toEqual(["aaa1111", "bbb2222"])
  })

  test("a run keeps what was marked before it started", async () => {
    const h = await harness((picker) => {
      picker.toggleMark("ddd4444")
      onRow(picker, 0)
      picker.toggleRange("aaa1111")
    })
    h.press("j")
    expect(h.marked()).toEqual(["aaa1111", "bbb2222", "ddd4444"])
  })

  test("every other key is kept from the chain and prevented, since no field is open to type it", async () => {
    const h = await harness((picker) => onRow(picker, 0))
    for (const name of ["x", "v", "p", "n", "q", "ctrl+v"]) {
      expect(h.press(name)).toEqual({ kept: true, prevented: true })
    }
    expect(h.marked()).toEqual([])
    expect(h.picker.selectedIndex()).toBe(1)
    expect(h.picker.open()).toBe(true)
  })

  test("Esc closes it", async () => {
    const h = await harness()
    h.press("escape")
    expect(h.picker.open()).toBe(false)
    expect(h.selected).toEqual([])
  })
})

describe("the commit picker's `/` mode", () => {
  test("`/` opens it, and Enter keeps the query", async () => {
    const h = await harness()
    expect(h.press("/")).toEqual({ kept: true, prevented: true })
    expect(h.picker.queryInput()).toBe(true)
    expect(h.press("return")).toEqual({ kept: true, prevented: true })
    expect(h.picker.queryInput()).toBe(false)
    expect(h.picker.open()).toBe(true)
  })

  test("Esc ends it without closing the picker", async () => {
    const h = await harness()
    h.press("/")
    expect(h.press("escape")).toEqual({ kept: true, prevented: true })
    expect(h.picker.queryInput()).toBe(false)
    expect(h.picker.open()).toBe(true)
  })

  test("a key named enter ends it too", async () => {
    const h = await harness()
    h.press("/")
    h.press("return", "enter")
    expect(h.picker.queryInput()).toBe(false)
  })

  test("the list's keys are letters of the query, kept from the chain and left for the prompt field", async () => {
    const h = await harness((picker) => onRow(picker, 0))
    h.press("/")
    for (const name of ["j", "k", "space", "/", "V", "ctrl+n"]) {
      expect(h.press(name)).toEqual({ kept: true, prevented: false })
    }
    expect(h.picker.selectedIndex()).toBe(1)
    expect(h.marked()).toEqual([])
    expect(h.picker.queryInput()).toBe(true)
  })
})
