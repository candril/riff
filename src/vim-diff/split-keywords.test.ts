import { test, expect, describe } from "bun:test"
import type { SimpleHighlight } from "@opentui/core"
import { dropSplitKeywords } from "./split-keywords"

/** The range of the `nth` occurrence of `word` in `text`. */
function range(text: string, word: string, nth = 0): [number, number] {
  let start = -1
  for (let i = 0; i <= nth; i++) start = text.indexOf(word, start + 1)
  return [start, start + word.length]
}

describe("a keyword the lexer found inside a name", () => {
  const text = "  personalized: Boolean\n  startJobApplication: ID\ndirective @oneOf on INPUT_OBJECT"

  test("is dropped from the middle of a name", () => {
    const parsed: SimpleHighlight[] = [[...range(text, "on", 0), "keyword"]]

    expect(dropSplitKeywords(parsed, text)).toEqual([])
  })

  test("is dropped from the end of a name", () => {
    const parsed: SimpleHighlight[] = [[...range(text, "on", 1), "keyword"]]

    expect(dropSplitKeywords(parsed, text)).toEqual([])
  })

  test("leaves the keyword that stands on its own", () => {
    const [start, end] = range(text, " on ")
    const parsed: SimpleHighlight[] = [[start + 1, end - 1, "keyword"]]

    expect(dropSplitKeywords(parsed, text)).toEqual(parsed)
  })

  test("leaves a keyword at the edge of the text", () => {
    const parsed: SimpleHighlight[] = [[0, 4, "keyword.type"]]

    expect(dropSplitKeywords(parsed, "type Query {")).toEqual(parsed)
  })

  test("leaves every other capture alone", () => {
    const parsed: SimpleHighlight[] = [[...range(text, "Boolean"), "type"], [2, 14, "property"]]

    expect(dropSplitKeywords(parsed, text)).toEqual(parsed)
  })
})
