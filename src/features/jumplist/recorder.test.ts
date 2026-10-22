import { test, expect, describe } from "bun:test"
import { createJumpRecorder, type Moment } from "./recorder"
import { back, forward, push, type Jump } from "./index"
import { createInitialState } from "../../state"
import { createCursorState } from "../../vim-diff/cursor-state"
import type { DiffFile } from "../../utils/diff-parser"
import { doc } from "../../diff-rows/fixtures"
import { RowLineSource } from "../../diff-rows/row-source"
import { DiffLineMapping } from "../../vim-diff/line-mapping"
import { lineOfRow } from "../../app/split-cursor"

type Key = { name: string; ctrl?: boolean; shift?: boolean; sequence?: string }

const place = (line: number, col = 0, selected: string | null = null): Jump => ({
  fileIndex: selected === null ? null : 0,
  filename: selected,
  viewingCommit: null,
  viewMode: "diff",
  anchor: null,
  cursorLine: line,
  cursorCol: col,
})

/** A moment in the all-files view: no file is selected, and the cursor's file comes from its line. */
const at = (file: string | null, line: number, col = 0, settled = true): Moment => ({
  place: place(line, col),
  file,
  settled,
})
const open = (m: Moment): Moment => ({ ...m, settled: false })

const key = (name: string, extra: Omit<Key, "name"> = {}): Key => ({ name, ...extra })
const ctrl = (name: string) => key(name, { ctrl: true })
const typed = (text: string) => [...text].map((c) => key(c, { sequence: c }))

/**
 * Feeds the recorder the moments the dispatcher would leave behind, one per
 * key, starting from `start`; returns what it asked to push.
 */
function drive(start: Moment, steps: [Key, Moment][]): Jump[] {
  const recorder = createJumpRecorder()
  const pushed: Jump[] = []
  let now = start
  for (const [k, next] of steps) {
    const jump = recorder.around(k, now, () => {}, () => next)
    if (jump) pushed.push(jump)
    now = next
  }
  return pushed
}

const origin = at("a.ts", 3, 4)

describe("a search is one jump, from where the prompt opened", () => {
  test("/foo<CR> moves on every character and records only the origin", () => {
    const pushed = drive(origin, [
      [key("/"), open(origin)],
      [key("f", { sequence: "f" }), open(at("a.ts", 10, 2))],
      [key("o", { sequence: "o" }), open(at("b.ts", 40, 0))],
      [key("o", { sequence: "o" }), open(at("b.ts", 41, 6))],
      [key("return"), at("b.ts", 41, 6)],
    ])
    expect(pushed).toEqual([origin.place])
  })

  test("?hjkl<CR> backward, a pattern of nothing but step letters", () => {
    const steps: [Key, Moment][] = [[key("?"), open(origin)]]
    typed("hjkl").forEach((k, i) => steps.push([k, open(at("a.ts", 2 - (i % 2), i))]))
    steps.push([key("return"), at("a.ts", 1, 3)])
    expect(drive(origin, steps)).toEqual([origin.place])
  })

  test("n and N each record where they left", () => {
    expect(drive(origin, [[key("n"), at("a.ts", 20)]])).toEqual([origin.place])
    expect(drive(origin, [[key("n", { shift: true }), at("a.ts", 1)]])).toEqual([origin.place])
  })

  test("Esc out of / restores the place, so there is nothing to record", () => {
    const pushed = drive(origin, [
      [key("/"), open(origin)],
      [key("x", { sequence: "x" }), open(at("b.ts", 9))],
      [key("escape"), origin],
    ])
    expect(pushed).toEqual([])
  })
})

describe("pickers", () => {
  for (const [label, opener] of [
    ["Ctrl-s occurrences", ctrl("s")],
    ["Ctrl-f files", ctrl("f")],
    ["the comments picker", key("c", { shift: true })],
  ] as const) {
    test(`${label}: typing j and k into it is not stepping, and Enter records the origin`, () => {
      const pushed = drive(origin, [
        [opener, open(origin)],
        ...typed("jk").map((k): [Key, Moment] => [k, open(origin)]),
        [key("j", { ctrl: true }), open(origin)],
        [key("return"), at("b.ts", 12)],
      ])
      expect(pushed).toEqual([origin.place])
    })

    test(`${label}: Esc records nothing`, () => {
      expect(drive(origin, [[opener, open(origin)], [key("j"), open(origin)], [key("escape"), origin]])).toEqual([])
    })
  }
})

describe("flash", () => {
  for (const label of ["j", "a"]) {
    test(`label ${label} in the diff is a jump`, () => {
      const pushed = drive(origin, [
        [key("s"), open(origin)],
        [key("x", { sequence: "x" }), open(origin)],
        [key(label, { sequence: label }), at("a.ts", 30, 5)],
      ])
      expect(pushed).toEqual([origin.place])
    })

    test(`label ${label} on the tree lands in another file`, () => {
      const pushed = drive(origin, [
        [key("s"), open(origin)],
        [key(label, { sequence: label }), { place: place(0, 0, "c.ts"), file: "c.ts", settled: true }],
      ])
      expect(pushed).toEqual([origin.place])
    })
  }

  test("Esc out of flash records nothing", () => {
    expect(drive(origin, [[key("s"), open(origin)], [key("x"), open(origin)], [key("escape"), origin]])).toEqual([])
  })
})

describe("chords", () => {
  for (const [first, second, land] of [
    ["g", "g", at("a.ts", 0)],
    ["]", "c", at("a.ts", 20)],
    ["[", "c", at("a.ts", 1)],
    ["]", "f", at("b.ts", 0)],
    ["[", "f", at("a.ts", 0)],
  ] as const) {
    test(`${first}${second} opens on the first key and records on the second`, () => {
      expect(drive(origin, [[key(first), open(origin)], [key(second), land]])).toEqual([origin.place])
    })
  }

  test("G is one key", () => {
    expect(drive(origin, [[key("G"), at("b.ts", 99)]])).toEqual([origin.place])
  })
})

describe("marks", () => {
  const quote = key("'", { sequence: "'" })

  test("'a is one jump, recorded from where ' was pressed", () => {
    expect(drive(origin, [[quote, open(origin)], [key("a", { sequence: "a" }), at("b.ts", 40)]])).toEqual([origin.place])
  })

  test("]m is one jump, recorded from where ] was pressed", () => {
    expect(drive(origin, [[key("]"), open(origin)], [key("m", { sequence: "m" }), at("b.ts", 40)]])).toEqual([origin.place])
  })

  test("'' is one jump too", () => {
    expect(drive(origin, [[quote, open(origin)], [quote, at("b.ts", 40)]])).toEqual([origin.place])
  })

  test("ma stays where it is and records nothing", () => {
    expect(drive(origin, [[key("m", { sequence: "m" }), open(origin)], [key("a", { sequence: "a" }), origin]])).toEqual([])
  })

  test("'a onto the place it was pressed records nothing", () => {
    expect(drive(origin, [[quote, open(origin)], [key("a", { sequence: "a" }), origin]])).toEqual([])
  })
})

describe("single keys that land elsewhere", () => {
  test("following a link", () => {
    expect(drive(origin, [[key("return"), at("c.ts", 7)]])).toEqual([origin.place])
  })

  test("thread motion", () => {
    expect(drive(origin, [[key("]"), open(origin)], [key("t"), at("a.ts", 60)]])).toEqual([origin.place])
  })
})

describe("what is not a jump", () => {
  test("f{x}, t{x} and ; stay on the line", () => {
    expect(drive(origin, [[key("f"), open(origin)], [key("x"), at("a.ts", 3, 9)]])).toEqual([])
    expect(drive(origin, [[key("t", { shift: true }), open(origin)], [key("x"), at("a.ts", 3, 1)]])).toEqual([])
    expect(drive(origin, [[key(";", { sequence: ";" }), at("a.ts", 3, 12)]])).toEqual([])
  })

  test("Ctrl-d and Ctrl-u scroll, as in vim", () => {
    expect(drive(origin, [[ctrl("d"), at("a.ts", 30)], [ctrl("u"), at("a.ts", 3)]])).toEqual([])
  })

  test("j inside a file", () => {
    expect(drive(origin, [[key("j"), at("a.ts", 4)]])).toEqual([])
  })

  test("j off the end of one file into the next, in the all-files view, is (spec 089)", () => {
    const last = at("a.ts", 9)
    expect(drive(last, [[key("j"), at("b.ts", 10)]])).toEqual([last.place])
  })
})

describe("walking the list", () => {
  test("Ctrl-o into another file and Ctrl-i back push nothing", () => {
    expect(drive(origin, [[ctrl("o"), at("b.ts", 5)], [key("tab"), origin], [ctrl("i"), at("c.ts", 1)]])).toEqual([])
  })

  test("back and forward keep both ends of the list", () => {
    const files: DiffFile[] = ["a.ts", "b.ts"].map((filename) => ({
      filename,
      additions: 0,
      deletions: 0,
      status: "unchanged" as const,
      content: "",
    }))
    let state = createInitialState(files, [], "local", "")
    const recorder = createJumpRecorder()
    const top = at("a.ts", 0)
    const bottom = at("b.ts", 99)
    const vimAt = (m: Moment) => ({ ...createCursorState(), line: m.place.cursorLine, col: m.place.cursorCol ?? 0 })
    const record = (k: Key, before: Moment, after: Moment) => {
      const jump = recorder.around(k, before, () => {}, () => after)
      if (jump) state = push(state, jump)
    }

    record(key("G"), top, bottom)

    const walkedBack = back(state, vimAt(bottom), { getLine: () => undefined })!
    state = walkedBack.state
    expect(walkedBack.jump).toEqual(top.place)
    record(ctrl("o"), bottom, top)

    const walkedForward = forward(state)!
    state = walkedForward.state
    expect(walkedForward.jump.cursorLine).toBe(99)
    record(key("tab"), top, bottom)

    expect(state.jumpList.entries.map((e) => e.cursorLine)).toEqual([0, 99])
    expect(back(state, vimAt(bottom), { getLine: () => undefined })!.jump).toEqual(top.place)
  })
})

describe("split", () => {
  test("places in lines converted from split rows record the same way", () => {
    const source = new RowLineSource(new DiffLineMapping([doc], "all"), "split", "right")
    const row = (r: number): Moment => ({ place: place(lineOfRow(r, source)), file: doc.filename, settled: true })
    expect(drive(row(2), [[key("G"), row(8)]])).toEqual([row(2).place])
    expect(drive(row(2), [[key("j"), row(5)]])).toEqual([])
  })
})

test("the recorder imports nothing outside the jumplist's own pure modules", async () => {
  const source = await Bun.file(new URL("./recorder.ts", import.meta.url)).text()
  const imported = [...source.matchAll(/from "([^"]+)"/g)].map(m => m[1]).sort()
  expect(imported).toEqual(["./keys", "./place", "./types"])
})
