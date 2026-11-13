import { describe, expect, test } from "bun:test"
import { parseDiff } from "../../utils/diff-parser"
import { DiffLineMapping } from "../../vim-diff/line-mapping"
import { computeWordDiff } from "../../vim-diff/word-diff"
import { ADDED_NESTED, MODIFIED_NESTED } from "./fixtures"

const changedWords = (raw: string) => {
  const mapping = new DiffLineMapping(parseDiff(raw), "all", undefined, { alignMarkdownTables: false })
  return [...computeWordDiff(mapping)].map(([line, spans]) => {
    const content = mapping.getLine(line)!.content
    return spans.map((span) => content.slice(span.startCol, span.endCol))
  })
}

describe("the words a nested line changed (spec 116)", () => {
  test("pair across the inner diff in a file the review added", () => {
    expect(changedWords(ADDED_NESTED)).toEqual([["old"], ["new"]])
  })

  test("pair across the review where it changed the line", () => {
    expect(changedWords(MODIFIED_NESTED)).toEqual([["new"], ["newer"]])
  })
})
