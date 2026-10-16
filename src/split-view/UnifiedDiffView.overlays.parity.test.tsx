import { test, expect, describe } from "bun:test"
import { SYNTAX_PALETTE } from "../diff-rows/syntax-palette"
import { ONE_LONG_LINE, TWO_FILES } from "../testing/diffs"
import { mountDiffView } from "../testing/frame"
import { bgAt, fgAt, ints } from "../testing/split-frame"
import { mountUnified } from "../testing/unified-frame"
import {
  charAt,
  except,
  expectSameColours,
  rowCells,
  sameRgba,
  screenOf,
  type At,
  type Case,
  type Rgba,
  type Screen,
} from "../testing/unified-parity"
import { theme } from "../theme"
import { parseDiff } from "../utils/diff-parser"
import { DiffLineMapping } from "../vim-diff/line-mapping"
import type { SplitSelection } from "./overlays"

/*
 * The unified view's search hits, charwise selection and flash against
 * VimDiffView's, as UnifiedDiffView.parity.test.tsx mounts the two. Every ‹
 * and ↳ is masked in the cell-for-cell cases: VimDiffView's drawMarker paints
 * those cells white, so they are held to the colours it means instead, in
 * the marker cases at the end and the corpus' marker colour tests.
 */

describe("the unified view overlays search, a selection and flash as VimDiffView does", () => {
  type Mounted = Awaited<ReturnType<typeof mountDiffView>>
  /** Where both views put the cursor; with an anchor, VimDiffView is in charwise visual mode from it. */
  interface Cursor {
    line: number
    col: number
    anchor?: { line: number; col: number }
  }
  interface Setup {
    cursor?: Cursor
    /** A line's column VimDiffView scrolls to; the new view is handed the column it lands on. */
    reveal?: { line: number; col: number }
    /** Colours VimDiffView's highlighter brings; a search's unless told otherwise. */
    highlighted?: Rgba[]
  }

  const SEARCH_BGS = [ints(SYNTAX_PALETTE["search.match"]!.bg!), ints(SYNTAX_PALETTE["search.current"]!.bg!)]
  const FLASH_BGS = [ints(theme.surface1), ints(theme.red)]
  const WORD_BGS = [ints(SYNTAX_PALETTE["diff.word.removed"]!.bg!), ints(SYNTAX_PALETTE["diff.word.added"]!.bg!)]

  function selectionOf(cursor: Cursor | undefined): SplitSelection | null {
    if (!cursor?.anchor) return null
    const { anchor } = cursor
    const anchorFirst = anchor.line < cursor.line || (anchor.line === cursor.line && anchor.col <= cursor.col)
    const [start, end] = anchorFirst ? [anchor, cursor] : [cursor, anchor]
    return { mode: "visual", startRow: start.line, startCol: start.col, endRow: end.line, endCol: end.col }
  }

  // VimDiffView injects search and word diffs through its highlighter, whose parse lands a frame or more after the first.
  async function untilHighlighted(old: Mounted, bgs: Rgba[]) {
    for (let tries = 0; tries < 60; tries++) {
      await old.frame()
      const { lines } = old.setup.captureSpans()
      if (lines.some((line) => line.spans.some((span) => bgs.some((bg) => sameRgba(span.bg.toInts(), bg))))) return
      await Bun.sleep(50)
    }
    throw new Error("VimDiffView's highlighter never drew")
  }

  async function screensOf(options: Case, { cursor, reveal, highlighted }: Setup = {}) {
    const old = await mountDiffView(options)
    if (cursor) {
      Object.assign(old.cursor, { line: cursor.line, col: cursor.col })
      if (cursor.anchor) {
        Object.assign(old.cursor, { mode: "visual", selectionAnchor: cursor.anchor.line, selectionAnchorCol: cursor.anchor.col })
      }
      old.view.updateCursor(old.cursor)
    }
    await old.frame()
    if (reveal !== undefined) {
      old.view.revealColumn(reveal.line, reveal.col)
      await old.frame()
    }
    const awaited = highlighted ?? (options.search ? SEARCH_BGS : null)
    if (awaited) await untilHighlighted(old, awaited)
    const column = old.view.getScrollBox()!.scrollLeft
    const oldScreen = screenOf(old)
    await old.dispose()
    const { wrap = false, ...rest } = options
    const fresh = await mountUnified({
      ...rest,
      wrap,
      header: true,
      column,
      cursor: { line: cursor?.line ?? 0 },
      selection: selectionOf(cursor),
    })
    await fresh.frame()
    const freshScreen = screenOf(fresh)
    await fresh.dispose()
    return { old: oldScreen, fresh: freshScreen, column }
  }

  /*
   * Glyph and background on every cell, the foreground only on a glyph and
   * only where `fgOn` says both views choose it alone: VimDiffView's code is white or its
   * highlighter's colours, the new view's is uncoloured by any parser here.
   * Only the cells that differ are listed, so a failure reads short.
   */
  function expectSame(old: Screen, fresh: Screen, cells: At[], fgOn: (at: At, oldBg: Rgba) => boolean) {
    expect(fresh.rows.map((r) => r.trimEnd())).toEqual(old.rows.map((r) => r.trimEnd()))
    const cellOf = (screen: Screen, [x, y]: At, withFg: boolean) => {
      const char = screen.rows[y]![x]
      const fg = withFg && char !== " " ? fgAt(screen.spans, x, y) : null
      return JSON.stringify({ x, y, char, bg: bgAt(screen.spans, x, y), fg })
    }
    const differing = cells.flatMap((at) => {
      const withFg = fgOn(at, bgAt(old.spans, ...at))
      const [was, is] = [cellOf(old, at, withFg), cellOf(fresh, at, withFg)]
      return was === is ? [] : [{ old: was, fresh: is }]
    })
    expect(differing).toEqual([])
  }

  /** The gutter, riff's own rows and any cell an overlay colours outright. */
  const decided =
    (gutter: number, chrome: number[], overlayBgs: Rgba[]) =>
    ([x, y]: At, bg: Rgba) =>
      x < gutter || chrome.includes(y) || overlayBgs.some((overlay) => sameRgba(bg, overlay))

  const matchesOf = (raw: string, word: string) => {
    const mapping = new DiffLineMapping(parseDiff(raw), "all")
    return mapping.allLines.flatMap((line, index) => {
      if (line.type !== "context" && line.type !== "addition" && line.type !== "deletion") return []
      const found = []
      for (let at = line.content.indexOf(word); at >= 0; at = line.content.indexOf(word, at + 1)) {
        found.push({ line: index, startCol: at, endCol: at + word.length })
      }
      return found
    })
  }

  const labelled = (matches: { line: number; startCol: number; endCol: number }[], unlabelled = -1) =>
    matches.map((match, i) => ({ ...match, label: i === unlabelled ? null : "asdfghjkl"[i]! }))

  // Screen rows of TWO_FILES under the header: each mapping line one down.
  const TWO_FILES_CHROME = [1, 8, 9, 10, 14]
  // The code's first column in every diff here.
  const GUTTER = 5

  /** TWO_FILES at 30 columns scrolled sideways, then searched: one hit starts left of the window, one sits inside it. */
  async function searchedSideways() {
    const options = { raw: TWO_FILES, width: 30, height: 20 }
    const reveal = { line: 1, col: 36 }
    const { column } = await screensOf(options, { reveal })
    expect(column).toBeGreaterThan(2)
    const search = {
      matches: [
        { line: 1, startCol: column - 2, endCol: column + 3 },
        { line: 6, startCol: column + 1, endCol: column + 4 },
      ],
      current: 1,
    }
    return screensOf({ ...options, search }, { reveal })
  }

  // Neither the file search nor the mapping's yields a match off a line of code, so none sits on a header or divider.
  describe("search", () => {
    test("several matches, one of them current", async () => {
      const matches = matchesOf(TWO_FILES, "name")
      expect(matches.length).toBe(5)
      const { old, fresh } = await screensOf({ raw: TWO_FILES, search: { matches, current: 2 } })
      expectSame(old, fresh, rowCells([2, 3, 4, 5, 11, 12], 79), decided(GUTTER, [], SEARCH_BGS))
    })

    test("a match across a wrapped line's break", async () => {
      // The addition's first row breaks after "going" and before "a fairly".
      const matches = matchesOf(ONE_LONG_LINE, "keeps going a fairly")
      expect(matches.length).toBe(1)
      const options = { raw: ONE_LONG_LINE, width: 60, height: 10, wrap: true, search: { matches, current: 0 } }
      const { old, fresh } = await screensOf(options)
      expect(old.rows[5]![4]).toBe("↳")
      // The ↳ is VimDiffView's white marker cell, held to its intended colours below.
      const cells = except(rowCells([4, 5, 6], 59), [4, 5])
      expect(bgAt(fresh.spans, 58, 4)).toEqual(SEARCH_BGS[1])
      expect(bgAt(fresh.spans, 47, 4)).not.toEqual(SEARCH_BGS[1])
      expect(bgAt(fresh.spans, 5, 5)).toEqual(SEARCH_BGS[1])
      expectSame(old, fresh, cells, decided(GUTTER, [], SEARCH_BGS))
    })

    // VimDiffView's highlighter ranks a changed word above a hit, so this stays on lines no word diff touches.
    // Not ONE_WIDE_LINE: past its first 13 columns the wide line is one changed word, so no hit shows there.
    test("a match partly left of a line scrolled sideways", async () => {
      const { old, fresh } = await searchedSideways()
      // Only the rows with a hit: past the widest line VimDiffView leaves a tinted row untinted once scrolled.
      // Each row's ‹ is VimDiffView's white marker cell.
      const cells = except(rowCells([2, 7], 29), [4, 2], [4, 7])
      expect(bgAt(fresh.spans, GUTTER + 2, 2)).toEqual(SEARCH_BGS[0])
      expect(bgAt(fresh.spans, GUTTER + 3, 2)).not.toEqual(SEARCH_BGS[0])
      expectSame(old, fresh, cells, decided(GUTTER, [], SEARCH_BGS))
    })
  })

  // Selection leaves the foreground alone, so only the gutter's and riff's own rows' are compared.
  describe("a charwise selection", () => {
    test("from mid-line over a divider, spacing and a file header to mid-line", async () => {
      const cursor = { line: 10, col: 9, anchor: { line: 6, col: 7 } }
      const { old, fresh } = await screensOf({ raw: TWO_FILES }, { cursor })
      // The cursor's own cells are VimDiffView's to paint, in a later step.
      const cells = except(rowCells([7, 8, 9, 10, 11], 79), [GUTTER, 11], [GUTTER + cursor.col, 11])
      expect(bgAt(fresh.spans, GUTTER + 7, 7)).toEqual(ints(theme.surface1))
      expect(bgAt(fresh.spans, GUTTER + 6, 7)).not.toEqual(ints(theme.surface1))
      expect(bgAt(fresh.spans, GUTTER + 7, 8)).not.toEqual(ints(theme.surface1))
      expectSame(old, fresh, cells, decided(GUTTER, TWO_FILES_CHROME, []))
    })

    test("over a wrapped line", async () => {
      const cursor = { line: 4, col: 0, anchor: { line: 3, col: 20 } }
      const { old, fresh } = await screensOf({ raw: ONE_LONG_LINE, width: 60, height: 10, wrap: true }, { cursor })
      const cells = except(rowCells([4, 5, 6], 59), [4, 5], [GUTTER, 6])
      expect(bgAt(fresh.spans, 40, 5)).toEqual(ints(theme.surface1))
      expectSame(old, fresh, cells, decided(GUTTER, [], []))
    })
  })

  describe("flash", () => {
    test("matches, labels and a match past the alphabet on lines of code; the backdrop on riff's own rows too", async () => {
      const flash = labelled(matchesOf(TWO_FILES, "name"), 1)
      const { old, fresh } = await screensOf({ raw: TWO_FILES, flash }, { highlighted: WORD_BGS })
      const cells = rowCells([1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 13, 14], 79)
      // The backdrop dims from the code's column, so the gutter keeps its colours.
      expect(fgAt(fresh.spans, 3, 2)).toEqual(ints(theme.overlay0))
      expect(fgAt(fresh.spans, 1, 1)).toEqual(ints(theme.overlay0))
      expectSame(old, fresh, cells, decided(GUTTER, TWO_FILES_CHROME, FLASH_BGS))
    })

    test("a match and its label on a wrapped line's continuation row", async () => {
      const flash = labelled(matchesOf(ONE_LONG_LINE, "keeps going"))
      const { old, fresh } = await screensOf({ raw: ONE_LONG_LINE, width: 60, height: 10, wrap: true, flash })
      const continuation = rowCells([5], 59).filter(([x, y]) => sameRgba(bgAt(old.spans, x, y), ints(theme.red)))
      expect(continuation.length).toBe(1)
      expectSame(old, fresh, except(rowCells([1, 2, 3, 4, 5, 6, 7], 59), [4, 5]), decided(GUTTER, [1, 7], FLASH_BGS))
    })

    test("a label on each file header's path", async () => {
      const flash = [
        { line: 0, startCol: 4, endCol: 9, label: "a" },
        { line: 9, startCol: 0, endCol: 3, label: "s" },
      ]
      const { old, fresh } = await screensOf({ raw: TWO_FILES, flash })
      expect(old.rows[1]![9]).toBe("a")
      expect(old.rows[10]![5]).toBe("s")
      expectSame(old, fresh, rowCells([1, 10], 79), decided(GUTTER, [1, 10], FLASH_BGS))
    })
  })

  /*
   * The cases above mask every ‹ and ↳; these hold one under each overlay to
   * what drawMarker means it to look like. None of the overlays reaches the
   * gutter's last column, flash's backdrop included: VimDiffView dims from
   * the code's first column, so the marker keeps its unfaded surface2.
   */
  describe("an overlaid marker keeps its intended colours", () => {
    const WRAPPED = { raw: ONE_LONG_LINE, width: 60, height: 10, wrap: true }
    const CONTINUATION: At = [4, 5]

    async function expectContinuationKept(options: Case, setup: Setup = {}) {
      const { old, fresh } = await screensOf(options, setup)
      expect(charAt(old, CONTINUATION)).toBe("↳")
      expectSameColours(old, fresh, [CONTINUATION], [[3, 5]])
      expect(fgAt(fresh.spans, ...CONTINUATION)).toEqual(ints(theme.surface2))
    }

    test("a ↳ beside a search hit across the break", async () => {
      const matches = matchesOf(ONE_LONG_LINE, "keeps going a fairly")
      await expectContinuationKept({ ...WRAPPED, search: { matches, current: 0 } })
    })

    test("a ↳ on a row a charwise selection covers", async () => {
      await expectContinuationKept(WRAPPED, { cursor: { line: 4, col: 0, anchor: { line: 3, col: 20 } } })
    })

    test("a ↳ under flash's backdrop", async () => {
      await expectContinuationKept({ ...WRAPPED, flash: labelled(matchesOf(ONE_LONG_LINE, "keeps going")) })
    })

    test("a ‹ beside a search hit cut off at the window's left edge", async () => {
      const { old, fresh } = await searchedSideways()
      const marker: At = [4, 2]
      expect(charAt(old, marker)).toBe("‹")
      expectSameColours(old, fresh, [marker], [[3, 2]])
      expect(fgAt(fresh.spans, ...marker)).toEqual(ints(theme.surface2))
    })
  })
})
