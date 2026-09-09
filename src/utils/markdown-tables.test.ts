import { test, expect, describe } from "bun:test"
import { alignMarkdownTables, splitRow, type AlignableLine } from "./markdown-tables"

function md(...contents: string[]): AlignableLine[] {
  return contents.map((content) => ({ type: "context", content, filename: "docs/guide.md" }))
}

/** Apply the changes so a test can read the table back as it renders. */
function aligned(lines: AlignableLine[]): string[] {
  const rendered = lines.map((line) => line.content)
  for (const change of alignMarkdownTables(lines)) {
    rendered[change.index] = change.content
  }
  return rendered
}

describe("alignMarkdownTables", () => {
  test("pads every cell of a table onto one grid", () => {
    expect(
      aligned(
        md(
          "| Command | Description |",
          "|---|---|",
          "| `jj status` | Show the working copy |",
          "| `jj new` | Start a change |"
        )
      )
    ).toEqual([
      "| Command     | Description           |",
      "| ----------- | --------------------- |",
      "| `jj status` | Show the working copy |",
      "| `jj new`    | Start a change        |",
    ])
  })

  test("lines a deleted row up with the added row that replaced it", () => {
    const lines: AlignableLine[] = [
      { type: "context", content: "| Key | Action |", filename: "a.md" },
      { type: "context", content: "|---|---|", filename: "a.md" },
      { type: "deletion", content: "| `zh` | Left |", filename: "a.md" },
      { type: "addition", content: "| `zh` | Scroll left |", filename: "a.md" },
    ]

    const rows = aligned(lines)
    // The pipes sit in the same columns on both sides, which is the point.
    expect(rows[2]!.indexOf("|", 1)).toBe(rows[3]!.indexOf("|", 1))
    expect(rows[2]).toBe("| `zh` | Left        |")
    expect(rows[3]).toBe("| `zh` | Scroll left |")
  })

  test("honours the delimiter row's alignment markers", () => {
    expect(
      aligned(md("| Name | Count | Note |", "|:---|---:|:---:|", "| a | 1000 | x |"))
    ).toEqual([
      "| Name | Count | Note |",
      "| :--- | ----: | :--: |",
      "| a    |  1000 |  x   |",
    ])
  })

  test("keeps a row's own indentation", () => {
    expect(aligned(md("  | a | b |", "  | ccc | d |"))).toEqual([
      "  | a   | b |",
      "  | ccc | d |",
    ])
  })

  test("leaves an already aligned table alone", () => {
    const lines = md("| a   | b |", "| ccc | d |")
    expect(alignMarkdownTables(lines)).toEqual([])
  })

  test("pads a short row out to the full column count", () => {
    expect(aligned(md("| a | b | c |", "| d |"))).toEqual([
      "| a | b | c |",
      "| d |   |   |",
    ])
  })

  test("ignores a lone pipe line", () => {
    expect(alignMarkdownTables(md("| not a table", "prose about it"))).toEqual([])
  })

  test("ignores files that are not markdown", () => {
    const lines: AlignableLine[] = [
      { type: "context", content: "| a | b |", filename: "src/app.ts" },
      { type: "context", content: "| ccc | d |", filename: "src/app.ts" },
    ]
    expect(alignMarkdownTables(lines)).toEqual([])
  })

  test("ignores a table documented inside a fenced block", () => {
    expect(
      alignMarkdownTables(md("```markdown", "| a | b |", "| ccc | d |", "```"))
    ).toEqual([])
  })

  test("aligns again after the fence closes", () => {
    const rows = aligned(md("```", "| a | b |", "```", "| c | d |", "| eee | f |"))
    expect(rows[1]).toBe("| a | b |")
    expect(rows[3]).toBe("| c   | d |")
    expect(rows[4]).toBe("| eee | f |")
  })

  test("does not merge tables from different files", () => {
    const lines: AlignableLine[] = [
      { type: "context", content: "| a | b |", filename: "one.md" },
      { type: "context", content: "| cccccc | d |", filename: "two.md" },
    ]
    expect(alignMarkdownTables(lines)).toEqual([])
  })
})

describe("splitRow", () => {
  test("keeps an escaped pipe inside its cell", () => {
    expect(splitRow("| a \\| b | c |").cells).toEqual(["a \\| b", "c"])
  })

  test("splits a pipe inside a code span, as GFM does", () => {
    expect(splitRow("| `a | b` | c |").cells).toEqual(["`a", "b`", "c"])
  })

  test("reads a row without leading and trailing pipes", () => {
    expect(splitRow("a | b").cells).toEqual(["a", "b"])
  })
})
