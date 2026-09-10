import { test, expect, describe } from "bun:test"
import { DiffLineMapping } from "./line-mapping"
import type { DiffFile } from "../utils/diff-parser"

const doc: DiffFile = {
  filename: "doc.md",
  additions: 1,
  deletions: 0,
  status: "modified",
  content: [
    "diff --git a/doc.md b/doc.md",
    "--- a/doc.md",
    "+++ b/doc.md",
    "@@ -1,6 +1,7 @@",
    " # Title",
    " ```mermaid",
    " sequenceDiagram",
    "+  A->>B: hi",
    " ```",
    " prose after",
  ].join("\n"),
}

function mapping(collapsedBlocks = new Set<string>()) {
  return new DiffLineMapping([doc], "all", undefined, { collapsedBlocks })
}

describe("a folded fenced block in the mapping", () => {
  test("is one row where its lines were, and says how many it hides", () => {
    const open = mapping()
    const block = open.foldableBlocks[0]!
    const folded = mapping(new Set([block.id]))

    expect(folded.lineCount).toBe(open.lineCount - (block.end - block.start))
    const row = folded.allLines.find((line) => line.blockFoldId === block.id)!
    expect(row.content).toBe("```mermaid  ▸ 2 lines")
  })

  test("the rows below it keep their own line numbers", () => {
    const block = mapping().foldableBlocks[0]!
    const folded = mapping(new Set([block.id]))
    const after = folded.allLines.find((line) => line.content === "prose after")!

    expect(after.newLineNum).toBe(6)
  })

  test("the fold row answers for the block, so `za` on it opens again", () => {
    const block = mapping().foldableBlocks[0]!
    const folded = mapping(new Set([block.id]))
    const row = folded.allLines.findIndex((line) => line.blockFoldId === block.id)

    expect(folded.blockAtLine(row)?.id).toBe(block.id)
  })
})
