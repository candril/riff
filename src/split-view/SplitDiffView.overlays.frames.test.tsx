import { test, expect, describe, afterEach } from "bun:test"
import { deepEquals as equal } from "bun"
import { CURSOR_LINE_BG, DELETION_BG } from "../diff-rows/line-colors"
import { fade } from "../diff-rows/segments"
import { SYNTAX_PALETTE } from "../diff-rows/syntax-palette"
import { TWO_FILES } from "../testing/diffs"
import { mountDiffView } from "../testing/frame"
import { bgAt, fgAt, ints, mountSplit, type MountSplitOptions } from "../testing/split-frame"
import { theme } from "../theme"
import { createCursorState } from "../vim-diff/cursor-state"
import type { FlashMatch } from "../vim-diff/flash-state"
import type { SplitSelection } from "./overlays"

/*
 * Search hits, the visual selection and flash, as unified paints them over
 * its rows. TWO_FILES at 120 columns: row 0 is greet.ts's header, row 2
 * pairs mapping line 2 (removed) with line 3 (added), row 4 has only a
 * right half, rows 6 and 7 are a divider and a spacer, row 8 is
 * farewell.ts's header. Code starts five cells into each half.
 */

const LEFT = 5
const RIGHT = 65

let mounted: Awaited<ReturnType<typeof mountSplit>> | null = null
let unified: Awaited<ReturnType<typeof mountDiffView>> | null = null

async function mount(options: Omit<MountSplitOptions, "raw">) {
  mounted = await mountSplit({ raw: TWO_FILES, ...options })
  await mounted.frame()
  return mounted
}

afterEach(async () => {
  await mounted?.dispose()
  await unified?.dispose()
  mounted = null
  unified = null
})

const spans = () => mounted!.setup.captureSpans()
const chars = async () => (await mounted!.frame()).split("\n")

describe("search", () => {
  test("the current match and the others take their colours in either half", async () => {
    await mount({
      search: {
        matches: [
          { line: 2, startCol: 2, endCol: 8 },
          { line: 3, startCol: 2, endCol: 8 },
        ],
        current: 1,
      },
    })
    const match = ints(SYNTAX_PALETTE["search.match"]!.bg!)
    const current = ints(SYNTAX_PALETTE["search.current"]!.bg!)

    expect(bgAt(spans(), LEFT + 2, 2)).toEqual(match)
    expect(bgAt(spans(), LEFT + 7, 2)).toEqual(match)
    expect(bgAt(spans(), LEFT + 8, 2)).toEqual(ints(DELETION_BG))
    expect(bgAt(spans(), RIGHT + 2, 2)).toEqual(current)
    expect(bgAt(spans(), RIGHT + 7, 2)).toEqual(current)
    expect(fgAt(spans(), RIGHT + 2, 2)).toEqual(ints(theme.base))
  })
})

describe("charwise selection", () => {
  const twoRows: SplitSelection = { mode: "visual", startRow: 2, startCol: 4, endRow: 3, endCol: 0 }

  test("runs from the anchor's column to the cursor's, inclusive, in the active half only", async () => {
    await mount({ selection: twoRows, side: "left" })
    const selected = ints(theme.surface1)

    expect(bgAt(spans(), LEFT + 3, 2)).toEqual(ints(DELETION_BG))
    expect(bgAt(spans(), LEFT + 4, 2)).toEqual(selected)
    // Lines in between, and the first one past its anchor, are covered to their last character.
    expect(bgAt(spans(), LEFT + 23, 2)).toEqual(selected)
    expect(bgAt(spans(), LEFT + 24, 2)).toEqual(ints(DELETION_BG))
    expect(bgAt(spans(), LEFT, 3)).toEqual(selected)
    expect(bgAt(spans(), LEFT + 1, 3)).not.toEqual(selected)
    for (const y of [2, 3]) expect(bgAt(spans(), RIGHT + 4, y)).not.toEqual(selected)
  })

  test("crossing panes takes the selection to the other half of the same rows", async () => {
    const view = await mount({ selection: twoRows, side: "left" })
    view.setSide("right")
    await view.frame()
    const selected = ints(theme.surface1)

    expect(bgAt(spans(), RIGHT + 4, 2)).toEqual(selected)
    expect(bgAt(spans(), RIGHT, 3)).toEqual(selected)
    expect(bgAt(spans(), LEFT + 4, 2)).toEqual(ints(DELETION_BG))
  })

  test("leaves the divider, the spacer and the file header between its rows alone", async () => {
    await mount({ selection: { mode: "visual", startRow: 5, startCol: 7, endRow: 9, endCol: 3 }, side: "right" })
    const selected = ints(theme.surface1)

    expect(bgAt(spans(), RIGHT + 7, 5)).toEqual(selected)
    expect(bgAt(spans(), 30, 6)).toEqual(ints(theme.mantle))
    expect(bgAt(spans(), 30, 7)).not.toEqual(selected)
    expect(bgAt(spans(), 30, 8)).toEqual(ints(theme.surface0))
    expect(bgAt(spans(), RIGHT + 3, 9)).toEqual(selected)
    expect(bgAt(spans(), RIGHT + 4, 9)).not.toEqual(selected)
  })
})

describe("linewise selection", () => {
  test("the active half's row takes surface0 and its gutter surface1, while the other half keeps its tint", async () => {
    await mount({ selection: { mode: "visual-line", startRow: 1, startCol: 0, endRow: 3, endCol: 0 }, side: "right", cursor: { row: 3, col: 0 } })

    expect(bgAt(spans(), RIGHT + 10, 2)).toEqual(ints(theme.surface0))
    expect(bgAt(spans(), 60, 2)).toEqual(ints(theme.surface1))
    expect(bgAt(spans(), RIGHT - 2, 2)).toEqual(ints(theme.surface1))
    expect(bgAt(spans(), LEFT + 10, 2)).toEqual(ints(DELETION_BG))
    // The cursor's row keeps the cursor line's colour over the selection's, as unified's does.
    expect(bgAt(spans(), RIGHT + 3, 3)).toEqual(ints(CURSOR_LINE_BG))
    expect(bgAt(spans(), 60, 3)).toEqual(ints(theme.surface1))
  })

  test("a divider and a spacer in range are coloured as unified colours them, and a file header is not", async () => {
    await mount({ selection: { mode: "visual-line", startRow: 5, startCol: 0, endRow: 9, endCol: 0 }, side: "right" })
    unified = await mountDiffView({ raw: TWO_FILES, width: 80, height: 18 })
    unified.view.update(unified.files, null, unified.mapping, {
      ...createCursorState(),
      mode: "visual-line",
      line: 10,
      selectionAnchor: 6,
      selectionAnchorCol: 0,
    }, [], new Map(), null, null)
    await unified.frame()
    const fromUnified = unified.setup.captureSpans()

    // Unified's rows sit one lower, under the app's header row.
    for (const [y, x] of [[6, 0], [6, 30], [7, 0], [7, 30], [8, 30]] as const) {
      expect(bgAt(spans(), x, y)).toEqual(bgAt(fromUnified, x, y + 1)!)
    }
    expect(bgAt(spans(), 0, 6)).toEqual(ints(theme.surface1))
    expect(bgAt(spans(), 30, 6)).toEqual(ints(theme.surface0))
  })
})

describe("flash", () => {
  const matches: FlashMatch[] = [
    { line: 3, startCol: 2, endCol: 4, label: "a" },
    { line: 0, startCol: 4, endCol: 6, label: "b" },
  ]

  test("labels a match's first character, recolours the rest of it and fades every other character", async () => {
    await mount({ flash: matches })
    const rows = await chars()

    expect(rows[2]![RIGHT + 2]).toBe("a")
    expect(rows[2]![RIGHT + 3]).toBe("e")
    expect(bgAt(spans(), RIGHT + 2, 2)).toEqual(ints(theme.red))
    expect(fgAt(spans(), RIGHT + 2, 2)).toEqual(ints(theme.base))
    expect(bgAt(spans(), RIGHT + 3, 2)).toEqual(ints(theme.surface1))
    expect(fgAt(spans(), RIGHT + 3, 2)).toEqual(ints(theme.text))
    expect(fgAt(spans(), LEFT + 5, 2)).toEqual(ints(fade(theme.text, DELETION_BG)))
  })

  test("a file header is labelled on its path and faded from the path on, as unified's is", async () => {
    await mount({ flash: matches })
    unified = await mountDiffView({ raw: TWO_FILES, width: 80, height: 18 })
    unified.view.setFlashState({ active: true, surface: "diff", pattern: "e", rows: [], matches })
    await unified.frame()
    const fromUnified = unified.setup.captureSpans()
    const rows = await chars()

    expect(rows[0]).toStartWith(" ▼   src/bree")
    expect(bgAt(spans(), 9, 0)).toEqual(ints(theme.red))
    for (let x = 0; x < 22; x++) {
      // A blank's foreground draws nothing, and the two views leave theirs differently.
      if (rows[0]![x] !== " ") expect([x, fgAt(spans(), x, 0)]).toEqual([x, fgAt(fromUnified, x, 1)!])
      expect([x, bgAt(spans(), x, 0)]).toEqual([x, bgAt(fromUnified, x, 1)!])
    }
  })

  const labelled = (y: number) =>
    Array.from({ length: 120 }, (_, x) => x).filter((x) => equal(bgAt(spans(), x, y), ints(theme.red)))

  test("a context line's matches are labelled in the pane each was found in, while a removal keeps its label on the left", async () => {
    await mount({
      side: "right",
      flash: [
        { line: 1, startCol: 0, endCol: 2, label: "c", pane: "right" },
        { line: 1, startCol: 0, endCol: 2, label: "e", pane: "left" },
        { line: 2, startCol: 2, endCol: 4, label: "d" },
      ],
    })
    const rows = await chars()

    expect(labelled(1)).toEqual([LEFT, RIGHT])
    expect(rows[1]![RIGHT]).toBe("c")
    expect(rows[1]![LEFT]).toBe("e")
    expect(labelled(2)).toEqual([LEFT + 2])
    expect(rows[2]![LEFT + 2]).toBe("d")
  })

  test("a match found in the right pane draws nothing in the left half of the same line", async () => {
    await mount({ side: "left", flash: [{ line: 1, startCol: 7, endCol: 9, label: "c", pane: "right" }] })
    const rows = await chars()

    expect(labelled(1)).toEqual([RIGHT + 7])
    expect(rows[1]![LEFT + 7]).toBe("f")
    expect(bgAt(spans(), LEFT + 8, 1)).not.toEqual(ints(theme.surface1))
  })

  test("a divider's label fades towards its row", async () => {
    await mount({ flash: [] })
    expect(fgAt(spans(), LEFT + 2, 6)).toEqual(ints(fade(theme.overlay0, theme.mantle)))
  })
})
