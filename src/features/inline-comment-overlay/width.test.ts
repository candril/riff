import { describe, expect, test } from "bun:test"
import { commentPanelWidth } from "./width"

describe("the thread panel's width", () => {
  test("collapsed, it aims for 64 columns, takes at most half the screen and never fewer than 48", () => {
    expect(commentPanelWidth(80, false)).toBe(48)
    expect(commentPanelWidth(120, false)).toBe(60)
    expect(commentPanelWidth(200, false)).toBe(64)
    expect(commentPanelWidth(300, false)).toBe(64)
  })

  test("expanded, it aims for 96 columns and takes at most 70% of the screen", () => {
    expect(commentPanelWidth(80, true)).toBe(56)
    expect(commentPanelWidth(120, true)).toBe(84)
    expect(commentPanelWidth(200, true)).toBe(96)
    expect(commentPanelWidth(300, true)).toBe(96)
  })
})
