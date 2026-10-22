import { test, expect, describe } from "bun:test"
import { theme } from "../theme"
import { ADDITION_BG, CURSOR_ADDITION_BG, CURSOR_DELETION_BG, CURSOR_LINE_BG, DELETION_BG } from "./line-colors"
import { SYNTAX_PALETTE } from "./syntax-palette"

const channels = (hex: string) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16))
const largestRise = (from: string, to: string) => {
  const a = channels(from)
  return Math.max(...channels(to).map((c, i) => c - a[i]!))
}
const largestGap = (one: string, other: string) => {
  const a = channels(one)
  return Math.max(...channels(other).map((c, i) => Math.abs(c - a[i]!)))
}

// Each cursor tint over the background its row has without the cursor.
const OVER = [
  ["context", theme.base, CURSOR_LINE_BG],
  ["addition", ADDITION_BG, CURSOR_ADDITION_BG],
  ["deletion", DELETION_BG, CURSOR_DELETION_BG],
] as const

test("the cursor tints", () => {
  expect([CURSOR_LINE_BG, CURSOR_ADDITION_BG, CURSOR_DELETION_BG]).toEqual(["#2a2b3d", "#28503c", "#502838"])
})

describe("the cursor line stands a clear step above its row", () => {
  for (const [kind, row, cursor] of OVER) {
    test(kind, () => {
      // Below about 10 the cursor line gets lost on a busy screen.
      expect(largestRise(row, cursor)).toBeGreaterThanOrEqual(10)
    })
  }
})

test("the cursor line still says which side it is on", () => {
  const [r, g, b] = channels(CURSOR_ADDITION_BG)
  expect(g).toBeGreaterThan(Math.max(r!, b!))
  const [dr, dg, db] = channels(CURSOR_DELETION_BG)
  expect(dr).toBeGreaterThan(Math.max(dg!, db!))
})

describe("overlays stay distinguishable on the cursor line", () => {
  // 15 on some channel is about where two dark shades stop blurring together.
  const APART = 15

  test("a word mark", () => {
    expect(largestGap(SYNTAX_PALETTE["diff.word.added"]!.bg!, CURSOR_ADDITION_BG)).toBeGreaterThanOrEqual(APART)
    expect(largestGap(SYNTAX_PALETTE["diff.word.removed"]!.bg!, CURSOR_DELETION_BG)).toBeGreaterThanOrEqual(APART)
  })

  test("a charwise selection", () => {
    expect(largestGap(theme.surface1, CURSOR_LINE_BG)).toBeGreaterThanOrEqual(APART)
  })
})
