import { test, expect, describe } from "bun:test"
import type { Comment } from "../types"
import { diffFile } from "../diff-rows/fixtures"
import { DiffLineMapping } from "../vim-diff/line-mapping"
import { diffPeekModel, hunkPeekModel } from "./peeks"

const mapping = new DiffLineMapping(
  [
    diffFile("docs/guide.md", [
      "@@ -1,9 +1,9 @@",
      " # Guide",
      " ```mermaid",
      " graph TD",
      "   A --> B",
      " ```",
      " | Key | Does |",
      " |---|---|",
      " | gl | peeks |",
      "-old prose",
      "+plain prose",
    ]),
  ],
  "all"
)
const at = (start: string) => mapping.allLines.findIndex((line) => line.content.trim().startsWith(start))
const scroll = { row: 0, col: 0 }
const peek = (line: number) => diffPeekModel(mapping, line, "new", scroll, 100, 30)

describe("what gl shows for the cursor's line", () => {
  test("inside a mermaid block, the diagram", () => {
    const model = peek(at("A --> B"))
    expect(model?.id).toBe("diagram-peek")
    expect(model?.header[0]).toEqual({ text: "mermaid", tone: "primary" })
  })

  test("on a table row, the table it belongs to", () => {
    const model = peek(at("| gl"))
    expect(model?.id).toBe("table-peek")
    expect(model?.header[0]).toEqual({ text: "table", tone: "primary" })
    expect(model?.header.at(-1)).toEqual({ text: "2 rows", tone: "dim" })
  })

  test("on a plain line, the line, numbered as the file numbers it and highlighted as its file", () => {
    const model = peek(at("plain prose"))
    expect(model).toEqual({
      id: "line-peek",
      width: 92,
      header: [
        { text: "line 9", tone: "primary" },
        { text: "11 cols", tone: "dim" },
      ],
      body: { kind: "code", content: "plain prose", filetype: "markdown", width: 88 },
      footer: "Press gl or Esc to close",
    })
  })

  test("past the last line, nothing", () => {
    expect(peek(mapping.lineCount + 5)).toBeNull()
  })
})

describe("what c shows for a comment in the thread panel", () => {
  const comment = (id: string, extra: Partial<Comment>): Comment => ({
    id,
    filename: "src/app/thing.ts",
    line: 3,
    side: "RIGHT",
    body: "why?",
    createdAt: "2026-01-01T00:00:00Z",
    status: "synced",
    ...extra,
  })
  const comments = [
    comment("root", { diffHunk: "@@ -1 +1 @@\n+x", outdated: true }),
    comment("reply", { inReplyTo: "root" }),
    comment("bare", {}),
  ]

  test("a reply borrows its root's hunk, and says so", () => {
    const model = hunkPeekModel(comments, "reply", 100, 30)
    expect(model?.id).toBe("hunk-peek")
    expect(model?.header).toEqual([
      { text: "thing.ts:3", tone: "primary" },
      { text: "as it was when this was written", tone: "peach" },
      { text: "· from the thread's first comment", tone: "dim" },
    ])
  })

  test("a comment with no hunk anywhere in its thread shows nothing", () => {
    expect(hunkPeekModel(comments, "bare", 100, 30)).toBeNull()
  })
})
