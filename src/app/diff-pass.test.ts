import { test, expect, describe } from "bun:test"
import { createInitialState } from "../state"
import { createCursorState } from "../vim-diff/cursor-state"
import { createSearchState } from "../vim-diff/search-state"
import { createFlashState } from "../vim-diff/flash-state"
import { DiffLineMapping } from "../vim-diff/line-mapping"
import { createDiffPass, parsesOf, type DiffPassDeps, type DiffPassInput } from "./diff-pass"

test("only files whose new text riff has read are handed over for parsing", () => {
  const parses = parsesOf({
    "a.ts": { newContent: "new a", oldContent: "old a", loading: false },
    "added.ts": { newContent: "added", oldContent: null, loading: false },
    "loading.ts": { newContent: null, oldContent: null, loading: true },
    "deleted.ts": { newContent: null, oldContent: "gone", loading: false },
  })
  expect([...parses]).toEqual([
    ["a.ts", { new: "new a", old: "old a" }],
    ["added.ts", { new: "added", old: null }],
  ])
})

describe("drawing the diff views for one pass", () => {
  function views() {
    const calls: unknown[][] = []
    const deps = {
      parses: { set: () => void calls.push(["parses.set"]) },
      fileContent: { contents: () => ({}) },
      unified: {
        draw: () => void calls.push(["unified.draw"]),
        syncDrawn: (drawn: boolean) => void calls.push(["unified.syncDrawn", drawn]),
        viewportHeight: () => 17,
      },
      split: {
        draw: () => void calls.push(["split.draw"]),
        syncDrawn: (drawn: boolean, height: number) => void calls.push(["split.syncDrawn", drawn, height]),
        island: { update: (patch: { focused: boolean }) => void calls.push(["split.island.update", patch]) },
      },
    } as unknown as DiffPassDeps
    return { pass: createDiffPass(deps), calls }
  }

  const input = (patch: Partial<DiffPassInput>): DiffPassInput => ({
    state: createInitialState([], [], "test", ""),
    vimState: createCursorState(),
    mapping: new DiffLineMapping([], "all"),
    searchState: createSearchState(),
    flashState: createFlashState(),
    blameColumns: new Map(),
    marks: [],
    focused: true,
    diffShown: true,
    splitOn: false,
    ...patch,
  })

  test("unified alone draws the unified view and leaves the split focus alone", () => {
    const { pass, calls } = views()
    pass.draw(input({ focused: false }))
    expect(calls).toEqual([
      ["parses.set"],
      ["unified.draw"],
      ["unified.syncDrawn", true],
      ["split.syncDrawn", false, 17],
    ])
  })

  test("split draws both views, and hands the split view whether the diff has the keys", () => {
    const { pass, calls } = views()
    pass.draw(input({ splitOn: true, focused: false }))
    expect(calls).toEqual([
      ["parses.set"],
      ["unified.draw"],
      ["split.draw"],
      ["unified.syncDrawn", false],
      ["split.syncDrawn", true, 17],
      ["split.island.update", { focused: false }],
    ])
  })

  test("a pass that shows something else draws neither view but still tells both they are not drawn", () => {
    const { pass, calls } = views()
    pass.draw(input({ diffShown: false }))
    expect(calls).toEqual([
      ["unified.syncDrawn", false],
      ["split.syncDrawn", false, 17],
    ])
  })

  test("with split on and the diff not shown, the split view is still synced as drawn and handed the focus", () => {
    const { pass, calls } = views()
    pass.draw(input({ diffShown: false, splitOn: true }))
    expect(calls).toEqual([
      ["unified.syncDrawn", false],
      ["split.syncDrawn", true, 17],
      ["split.island.update", { focused: true }],
    ])
  })
})
