import { describe, test, expect } from "bun:test"
import { helpOverlayModel } from "./help-overlay-model"
import { HELP_BODY_ROWS, helpViewport } from "./help-sections"

describe("helpOverlayModel", () => {
  test("keeps the version", () => {
    expect(helpOverlayModel("1.2.3", 0, 70).version).toBe("1.2.3")
  })

  test("has no version key without a version", () => {
    expect(Object.keys(helpOverlayModel(undefined, 0, 70))).not.toContain("version")
  })

  test("a terminal tall enough shows every row and nothing more", () => {
    const model = helpOverlayModel(undefined, 3, 70)
    expect(model.scroll).toBe(0)
    expect(Math.max(model.left.length, model.right.length)).toBe(HELP_BODY_ROWS)
    expect(model.more).toEqual({ above: false, below: false })
  })

  test("scroll is clamped at both ends", () => {
    const { maxScroll } = helpViewport(40)
    expect(helpOverlayModel(undefined, -5, 40).scroll).toBe(0)
    expect(helpOverlayModel(undefined, maxScroll + 5, 40).scroll).toBe(maxScroll)
  })

  test("each window holds the viewport's rows, flagged by what lies beyond it", () => {
    const { rows, maxScroll } = helpViewport(40)
    const at = (scroll: number) => helpOverlayModel(undefined, scroll, 40)
    expect(at(0).right).toHaveLength(rows)
    expect(at(0).left).toHaveLength(rows)
    expect(at(0).more).toEqual({ above: false, below: true })
    expect(at(1).more).toEqual({ above: true, below: true })
    expect(at(maxScroll).more).toEqual({ above: true, below: false })
    expect(at(maxScroll).right.at(-1)).toMatchObject({ kind: "key", key: "q" })
  })
})
