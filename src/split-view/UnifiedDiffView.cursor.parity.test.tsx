import { test, expect, describe } from "bun:test"
import { MANY_WRAPPED_LINES, ONE_WIDE_LINE, TWO_FILES } from "../testing/diffs"
import { mountDiffView } from "../testing/frame"
import { mountUnified } from "../testing/unified-frame"
import type { Case } from "../testing/unified-parity"

/*
 * The terminal's cursor the unified view places against the one
 * VimDiffView's post-process places, both under the same header row. No
 * frame shows it, so each is read back from its renderer. Tabs and file
 * headers are left out: there the new view puts the cursor where it draws
 * the character, VimDiffView at the raw column.
 */

interface CursorCase extends Case {
  cursor: { line: number; col: number }
  scrollTop?: number
  /** A column for VimDiffView to scroll into view, sideways. */
  reveal?: number
}

const stateOf = (renderer: { getCursorState(): { x: number; y: number; visible: boolean; style: string } }) => {
  const { x, y, visible, style } = renderer.getCursorState()
  return { x, y, visible, style }
}

async function cursorsOf({ cursor, scrollTop, reveal, ...options }: CursorCase) {
  const old = await mountDiffView(options)
  Object.assign(old.cursor, cursor)
  old.view.updateCursor(old.cursor)
  await old.frame()
  // Once laid out: before that VimDiffView knows no code window to scroll.
  if (reveal !== undefined) old.view.revealColumn(cursor.line, reveal)
  if (scrollTop !== undefined) old.view.getScrollBox()!.scrollTop = scrollTop
  await old.frame()
  const box = old.view.getScrollBox()!
  const where = { scrollTop: box.scrollTop, column: box.scrollLeft }
  const oldCursor = stateOf(old.setup.renderer)
  await old.dispose()

  const { wrap = false, ...rest } = options
  const fresh = await mountUnified({ ...rest, wrap, header: true, cursor, ...where })
  await fresh.frame()
  const freshCursor = stateOf(fresh.setup.renderer)
  await fresh.dispose()
  return { old: oldCursor, fresh: freshCursor, ...where }
}

describe("the unified view places the terminal's cursor where VimDiffView does", () => {
  test("on a line of code", async () => {
    const { old, fresh } = await cursorsOf({ raw: TWO_FILES, cursor: { line: 3, col: 9 } })
    expect(old).toMatchObject({ visible: true, style: "block" })
    expect(fresh).toEqual(old)
  })

  test("on a line scrolled sideways", async () => {
    const { old, fresh, column } = await cursorsOf({ raw: ONE_WIDE_LINE, height: 8, cursor: { line: 3, col: 150 }, reveal: 150 })
    expect(column).toBeGreaterThan(0)
    expect(old.visible).toBe(true)
    expect(fresh).toEqual(old)
  })

  test("on a wrapped line's continuation", async () => {
    // Each line wraps once at 120 columns, after 113 cells of code: col 120 is on line 2's second row.
    const { old, fresh } = await cursorsOf({
      raw: MANY_WRAPPED_LINES,
      width: 120,
      height: 12,
      wrap: true,
      cursor: { line: 2, col: 120 },
    })
    expect(old).toMatchObject({ y: 1 + 4 + 1, visible: true })
    expect(fresh).toEqual(old)
  })

  test("in two files scrolled down", async () => {
    const { old, fresh, scrollTop } = await cursorsOf({
      raw: TWO_FILES,
      height: 8,
      cursor: { line: 11, col: 4 },
      scrollTop: 6,
    })
    expect(scrollTop).toBe(6)
    expect(old).toMatchObject({ y: 1 + 11 - 6 + 1, visible: true })
    expect(fresh).toEqual(old)
  })
})
