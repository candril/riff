import { describe, expect, test } from "bun:test"
import { wordWrapRows } from "./word-wrap-rows"

// Each count here was read off OpenTUI's own textarea with wrapMode="word".
describe("the rows a line word-wraps to", () => {
  test("a line without breaks wraps by character, and an empty one is a row", () => {
    expect(wordWrapRows("", 10)).toBe(1)
    expect(wordWrapRows("x".repeat(10), 10)).toBe(1)
    expect(wordWrapRows("x".repeat(25), 10)).toBe(3)
  })

  test("a word that does not fit moves to the next row whole", () => {
    expect(wordWrapRows("aaaaaa bbbbbb cccccc", 10)).toBe(3)
    expect(wordWrapRows("aaaa bbbb cccc", 10)).toBe(2)
  })

  test("a line may break after a hyphen, slash or punctuation, not after an underscore", () => {
    expect(wordWrapRows("aaaaaa-bbbbbb-cccccc", 10)).toBe(3)
    expect(wordWrapRows("aaaaaa/bbbbbb.cccccc", 10)).toBe(3)
    expect(wordWrapRows("aaaaaa_bbbbbb_cccccc", 10)).toBe(2)
  })

  test("a word wider than the row starts a row of its own and breaks by character", () => {
    expect(wordWrapRows("aa " + "x".repeat(23), 10)).toBe(4)
  })

  test("spaces after a word hang past the edge, but leading spaces wrap", () => {
    expect(wordWrapRows("aaaaaaaaa    ", 9)).toBe(1)
    expect(wordWrapRows("aa    b", 2)).toBe(2)
    expect(wordWrapRows("     ", 2)).toBe(3)
    expect(wordWrapRows("   aaaa", 3)).toBe(3)
  })

  test("wide characters take two columns; ideographs break between each other, emoji do not", () => {
    expect(wordWrapRows("日本語日本語日本語", 10)).toBe(2)
    expect(wordWrapRows("aaaaaa 日本語日本語", 10)).toBe(2)
    expect(wordWrapRows("aaaaaa 😀😀😀😀😀😀", 10)).toBe(3)
    expect(wordWrapRows("aa aa日#bbbbbb", 7)).toBe(3)
  })
})
