import { test, expect, describe } from "bun:test"
import { naturalCells, versionFits } from "./header-fit"

describe("naturalCells", () => {
  test("adds the gap between children, not inside a run", () => {
    expect(naturalCells([["riff"], ["src/greet.ts"], ["+2", " ", "-1"]], 2)).toBe(4 + 2 + 12 + 2 + 5)
  })

  test("counts a wide glyph as the two cells it is drawn in", () => {
    expect(naturalCells([["日本"]], 1)).toBe(4)
  })

  test("an empty row takes nothing", () => {
    expect(naturalCells([], 2)).toBe(0)
  })
})

describe("versionFits", () => {
  // Padding 2, left 36, separation 2, right 5, gap 2, version 10.
  const natural = { left: 36, right: 5 }

  test("fits when the whole row, version included, is exactly the width", () => {
    expect(versionFits(57, natural, 10)).toBe(true)
  })

  test("is dropped one cell short of that", () => {
    expect(versionFits(56, natural, 10)).toBe(false)
  })

  test("an empty right side needs no gap before the version", () => {
    expect(versionFits(34, { left: 20, right: 0 }, 10)).toBe(true)
    expect(versionFits(33, { left: 20, right: 0 }, 10)).toBe(false)
  })
})
