import { test, expect, describe } from "bun:test"
import { findFoldableBlocks, blockAt, type FoldableLine } from "./fenced-blocks"

function line(content: string, over: Partial<FoldableLine> = {}): FoldableLine {
  return { type: "context", content, filename: "doc.md", newLineNum: 1, ...over }
}

const rows: FoldableLine[] = [
  line("doc.md", { type: "file-header" }),
  line("# Title", { newLineNum: 1 }),
  line("```mermaid", { newLineNum: 2 }),
  line("sequenceDiagram", { newLineNum: 3 }),
  line("  A->>B: hi", { type: "addition", newLineNum: 4 }),
  line("```", { newLineNum: 5 }),
  line("prose after", { newLineNum: 6 }),
]

describe("a fenced block as a fold", () => {
  test("runs fence to fence, and knows what it is", () => {
    const [block] = findFoldableBlocks(rows)

    expect(block).toMatchObject({ info: "mermaid", start: 2, end: 5, size: 2, filename: "doc.md" })
    // The id is the file's own line, not the row: a rebuild renumbers rows.
    expect(block!.id).toBe("doc.md:RIGHT:2")
  })

  test("covers its fences and nothing outside them", () => {
    const blocks = findFoldableBlocks(rows)

    expect(blockAt(blocks, 2)?.info).toBe("mermaid")
    expect(blockAt(blocks, 5)?.info).toBe("mermaid")
    expect(blockAt(blocks, 6)).toBeNull()
    expect(blockAt(blocks, 1)).toBeNull()
  })

  test("an unclosed fence is prose, not a block", () => {
    expect(findFoldableBlocks(rows.slice(0, 5))).toEqual([])
  })

  test("a fence carrying an info string opens, never closes", () => {
    const blocks = findFoldableBlocks([
      line("```md", { newLineNum: 1 }),
      line("text", { newLineNum: 2 }),
      line("```json", { newLineNum: 3 }),
      line("```", { newLineNum: 4 }),
    ])
    expect(blocks.length).toBe(1)
    expect(blocks[0]).toMatchObject({ info: "md", start: 0, end: 3 })
  })

  test("a fence does not reach across a file boundary", () => {
    expect(findFoldableBlocks([
      line("```mermaid", { newLineNum: 9 }),
      line("a.md", { type: "file-header" }),
      line("```", { newLineNum: 1 }),
    ])).toEqual([])
  })
})
