import { describe, test, expect } from "bun:test"
import { helpOverlayModel } from "./help-overlay-model"
import { HELP_BODY_ROWS, HELP_MARGIN, HELP_SECTIONS, helpLayout, helpRows, helpViewport } from "./help-sections"

const WIDE = 200

describe("helpOverlayModel", () => {
  test("keeps the version", () => {
    expect(helpOverlayModel("1.2.3", 0, 70, WIDE).version).toBe("1.2.3")
  })

  test("has no version key without a version", () => {
    expect(Object.keys(helpOverlayModel(undefined, 0, 70, WIDE))).not.toContain("version")
  })

  test("a terminal tall enough shows every row and nothing more", () => {
    const model = helpOverlayModel(undefined, 3, 70, WIDE)
    expect(model.scroll).toBe(0)
    expect(Math.max(...model.columns.map((column) => column.rows.length))).toBe(HELP_BODY_ROWS)
    expect(model.more).toEqual({ above: false, below: false })
  })

  test("scroll is clamped at both ends", () => {
    const { maxScroll } = helpViewport(40, WIDE)
    expect(helpOverlayModel(undefined, -5, 40, WIDE).scroll).toBe(0)
    expect(helpOverlayModel(undefined, maxScroll + 5, 40, WIDE).scroll).toBe(maxScroll)
  })

  test("each window holds the viewport's rows, flagged by what lies beyond it", () => {
    const { rows, maxScroll } = helpViewport(40, WIDE)
    const at = (scroll: number) => helpOverlayModel(undefined, scroll, 40, WIDE)
    expect(at(0).columns.map((column) => column.rows.length)).toEqual([rows, rows])
    expect(at(0).more).toEqual({ above: false, below: true })
    expect(at(1).more).toEqual({ above: true, below: true })
    expect(at(maxScroll).more).toEqual({ above: true, below: false })
    expect(at(maxScroll).columns[1]!.rows.at(-1)).toMatchObject({ kind: "key", key: "q" })
  })

  test("is as wide as the layout for the screen, and never wider than the screen less its margin", () => {
    for (const width of [WIDE, 104, 85, 60]) {
      const model = helpOverlayModel(undefined, 0, 40, width)
      expect(model.width).toBe(helpLayout(width).width)
      expect(model.width).toBeLessThanOrEqual(width - 2 * HELP_MARGIN)
    }
  })

  test("on a narrow screen one column scrolls through every section, down to the last row", () => {
    const { maxScroll } = helpViewport(40, 60)
    const at = (scroll: number) => helpOverlayModel(undefined, scroll, 40, 60)
    expect(at(0).columns).toHaveLength(1)
    expect(maxScroll).toBe(helpRows(HELP_SECTIONS).length - helpViewport(40, 60).rows)
    expect(at(maxScroll).columns[0]!.rows.at(-1)).toMatchObject({ kind: "key", key: "q" })
    expect(at(maxScroll).more).toEqual({ above: true, below: false })
  })
})
