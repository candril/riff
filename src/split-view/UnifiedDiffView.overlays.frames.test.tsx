import { test, expect, describe, afterEach } from "bun:test"
import { ADDITION_BG, DELETION_BG } from "../diff-rows/line-colors"
import { fade } from "../diff-rows/segments"
import { SYNTAX_PALETTE } from "../diff-rows/syntax-palette"
import { ONE_LONG_LINE, TWO_FILES } from "../testing/diffs"
import { charAt, screenOf, type At, type Screen } from "../testing/screen"
import { bgAt, fgAt, ints } from "../testing/split-frame"
import { mountUnified, type MountUnifiedOptions } from "../testing/unified-frame"
import { theme } from "../theme"
import { parseDiff } from "../utils/diff-parser"
import { DiffLineMapping } from "../vim-diff/line-mapping"

/*
 * Search hits, a charwise selection and flash over the unified view, under
 * the app's one-row header: each mapping line sits one screen row down, its
 * code from column 6. UnifiedDiffView.frames.test.tsx holds the same
 * overlays with no header row; these add the sideways window, wrapped
 * lines, riff's own rows and the markers beside each overlay.
 */

let mounted: Awaited<ReturnType<typeof mountUnified>> | null = null

async function screenWith(options: MountUnifiedOptions): Promise<Screen> {
  mounted = await mountUnified({ ...options, header: true })
  await mounted.frame()
  return screenOf(mounted)
}

afterEach(async () => {
  await mounted?.dispose()
  mounted = null
})

const CODE = 6
const MATCH = ints(SYNTAX_PALETTE["search.match"]!.bg!)
const CURRENT = ints(SYNTAX_PALETTE["search.current"]!.bg!)
const NONE: ReturnType<typeof ints> = [0, 0, 0, 0]

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

const colours = (screen: Screen, [x, y]: At) => [fgAt(screen.spans, x, y), bgAt(screen.spans, x, y)]

/** TWO_FILES at 31 columns, scrolled as revealing column 36 of its first line scrolls it. */
const SIDEWAYS = { raw: TWO_FILES, width: 31, height: 20, column: 16 }
// One hit starts left of the window, the current one sits inside it.
const SIDEWAYS_SEARCH = {
  matches: [
    { line: 1, startCol: 14, endCol: 19 },
    { line: 6, startCol: 17, endCol: 20 },
  ],
  current: 1,
}

describe("search", () => {
  test("each hit in the match colour, the current one in its own, the text on it in base", async () => {
    const matches = matchesOf(TWO_FILES, "name")
    expect(matches.length).toBe(5)
    const screen = await screenWith({ raw: TWO_FILES, search: { matches, current: 2 } })
    for (const [i, { line, startCol, endCol }] of matches.entries()) {
      const y = line + 1
      const hit = i === 2 ? CURRENT : MATCH
      expect([line, colours(screen, [CODE + startCol, y]), bgAt(screen.spans, CODE + endCol - 1, y)]).toEqual([line, [ints(theme.base), hit], hit])
      expect([line, bgAt(screen.spans, CODE + endCol, y)]).not.toEqual([line, hit])
    }
  })

  test("a hit partly left of a line scrolled sideways shows only its part in the window", async () => {
    const screen = await screenWith({ ...SIDEWAYS, search: SIDEWAYS_SEARCH })
    expect(screen.rows[2]!.trimEnd()).toBe("    1‹greet(name: string) {")
    expect([CODE, CODE + 2, CODE + 3].map((x) => bgAt(screen.spans, x, 2))).toEqual([MATCH, MATCH, NONE])
    expect(screen.rows[7]!.trimEnd()).toBe("    5‹sion = 1")
    expect([CODE, CODE + 1, CODE + 3, CODE + 4].map((x) => bgAt(screen.spans, x, 7))).toEqual([NONE, CURRENT, CURRENT, NONE])
  })
})

describe("a charwise selection", () => {
  test("over a wrapped line, from mid-line through its continuation to the next line's first character", async () => {
    const screen = await screenWith({
      raw: ONE_LONG_LINE,
      width: 61,
      height: 10,
      wrap: true,
      cursor: { line: 4, col: 0 },
      selection: { mode: "visual", startRow: 3, startCol: 20, endRow: 4, endCol: 0 },
    })
    const selected = ints(theme.surface1)
    expect([CODE + 19, CODE + 20, CODE + 53].map((x) => bgAt(screen.spans, x, 4))).toEqual([ints(ADDITION_BG), selected, selected])
    expect([CODE, CODE + 36, CODE + 37].map((x) => bgAt(screen.spans, x, 5))).toEqual([selected, selected, ints(ADDITION_BG)])
    expect(bgAt(screen.spans, CODE, 6)).toEqual(selected)
    // Selection leaves the text's own colour.
    expect(fgAt(screen.spans, CODE + 20, 4)).toEqual(ints(theme.text))
  })
})

describe("flash", () => {
  test("labels, a match past the alphabet, and the backdrop over riff's own rows from the code's column", async () => {
    const screen = await screenWith({ raw: TWO_FILES, flash: labelled(matchesOf(TWO_FILES, "name"), 1) })
    expect(screen.rows[2]!.trimEnd()).toBe("    1 export function greet(aame: string) {")
    expect([colours(screen, [28, 2]), colours(screen, [29, 2])]).toEqual([
      [ints(theme.base), ints(theme.red)],
      [ints(theme.text), ints(theme.surface1)],
    ])
    // The match past the alphabet keeps its own character, recoloured.
    expect(screen.rows[3]!.trimEnd()).toBe(`    2   return "Hello " + name`)
    expect(colours(screen, [26, 3])).toEqual([ints(theme.text), ints(theme.surface1)])
    expect(fgAt(screen.spans, CODE + 1, 3)).toEqual(ints(fade(theme.text, DELETION_BG)))
    // The gutter is lit, the header's markers dimmed, its path and counts faded.
    expect(fgAt(screen.spans, 4, 2)).toEqual(ints(theme.overlay0))
    expect([1, 5, 18, 21].map((x) => fgAt(screen.spans, x, 1))).toEqual([
      ints(theme.overlay0),
      ints(fade(theme.blue, theme.surface0)),
      ints(fade(theme.green, theme.surface0)),
      ints(fade(theme.red, theme.surface0)),
    ])
    for (const y of [8, 14]) {
      expect([fgAt(screen.spans, 6, y), fgAt(screen.spans, 26, y)]).toEqual([
        ints(fade(theme.overlay0, theme.mantle)),
        ints(fade(theme.surface2, theme.mantle)),
      ])
    }
  })

  test("a match and its label on a wrapped line's continuation row", async () => {
    const screen = await screenWith({
      raw: ONE_LONG_LINE,
      width: 61,
      height: 10,
      wrap: true,
      flash: labelled(matchesOf(ONE_LONG_LINE, "keeps going")),
    })
    expect(screen.rows[4]!.trimEnd()).toBe(`    2   const message = "a fairly long line that aeeps going`)
    expect(screen.rows[5]!.trimEnd()).toBe(`     ↳a fairly long line that seeps going "`)
    const red = (y: number) => Array.from({ length: 60 }, (_, x) => x).filter((x) => bgAt(screen.spans, x, y)?.join() === ints(theme.red).join())
    expect([red(4), red(5)]).toEqual([[49], [30]])
    expect(colours(screen, [31, 5])).toEqual([ints(theme.text), ints(theme.surface1)])
    expect(fgAt(screen.spans, CODE, 5)).toEqual(ints(fade(theme.text, ADDITION_BG)))
  })

  test("a label on each file header's path", async () => {
    const screen = await screenWith({
      raw: TWO_FILES,
      flash: [
        { line: 0, startCol: 4, endCol: 9, label: "a" },
        { line: 9, startCol: 0, endCol: 3, label: "s" },
      ],
    })
    expect(screen.rows[1]!.trimEnd()).toBe(" ▼   src/areet.ts +2 -1")
    // farewell.ts's label is an "s" over the path's own "s".
    expect(screen.rows[10]!.trimEnd()).toBe(" ▼   src/farewell.ts +3 -0")
    expect([colours(screen, [9, 1]), colours(screen, [5, 10])]).toEqual([
      [ints(theme.base), ints(theme.red)],
      [ints(theme.base), ints(theme.red)],
    ])
  })
})

/*
 * A ‹ or ↳ under an overlay keeps its surface2 glyph over the gutter's
 * background: no overlay reaches the gutter, flash's backdrop included.
 */
describe("a marker beside an overlay", () => {
  const WRAPPED = { raw: ONE_LONG_LINE, width: 61, height: 10, wrap: true }
  const CONTINUATION: At = [5, 5]

  async function expectContinuationKept(options: MountUnifiedOptions) {
    const screen = await screenWith(options)
    expect(charAt(screen, CONTINUATION)).toBe("↳")
    expect([colours(screen, CONTINUATION), bgAt(screen.spans, 4, 5)]).toEqual([[ints(theme.surface2), ints(theme.base)], ints(theme.base)])
  }

  test("a ↳ beside a search hit across the break", async () => {
    await expectContinuationKept({ ...WRAPPED, search: { matches: matchesOf(ONE_LONG_LINE, "keeps going a fairly"), current: 0 } })
    expect(bgAt(screenOf(mounted!).spans, CODE, 5)).toEqual(CURRENT)
  })

  test("a ↳ on a row a charwise selection covers", async () => {
    await expectContinuationKept({
      ...WRAPPED,
      cursor: { line: 4, col: 0 },
      selection: { mode: "visual", startRow: 3, startCol: 20, endRow: 4, endCol: 0 },
    })
  })

  test("a ↳ under flash's backdrop", async () => {
    await expectContinuationKept({ ...WRAPPED, flash: labelled(matchesOf(ONE_LONG_LINE, "keeps going")) })
  })

  test("a ‹ beside a search hit cut off at the window's left edge", async () => {
    const screen = await screenWith({ ...SIDEWAYS, search: SIDEWAYS_SEARCH })
    expect(charAt(screen, [5, 2])).toBe("‹")
    expect([colours(screen, [5, 2]), bgAt(screen.spans, 4, 2)]).toEqual([[ints(theme.surface2), ints(theme.mantle)], ints(theme.mantle)])
  })
})
