import { describe, expect, test } from "bun:test"
import { renderMermaid } from "../../utils/mermaid"
import { isMarkdownFile, renderMarkdown, type RenderedRow } from "./render"

const texts = (rows: readonly RenderedRow[]) => rows.map((row) => row.text)
const lines = (rows: readonly RenderedRow[]) => rows.map((row) => row.sourceLine)

/** The text each span covers, with its capture, so a test reads like the screen. */
const spanned = (row: RenderedRow) => row.spans.map(([from, to, capture]) => [row.text.slice(from, to), capture])

describe("renderMarkdown", () => {
  test("a heading drops its hashes and carries its level over the whole row", () => {
    const [row] = renderMarkdown("### Shipping")
    expect(row!.text).toBe("Shipping")
    expect(spanned(row!)).toEqual([["Shipping", "markup.heading.3"]])
  })

  test("a paragraph keeps one row per source line", () => {
    const rows = renderMarkdown("first line\nsecond line")
    expect(texts(rows)).toEqual(["first line", "second line"])
    expect(lines(rows)).toEqual([1, 2])
  })

  test("inline markup becomes spans over its text, without the markers", () => {
    const [row] = renderMarkdown("a **b** *i* `c` ~~d~~ [t](https://example.com)")
    expect(row!.text).toBe("a b i c d t")
    expect(spanned(row!)).toEqual([
      ["b", "markup.strong"],
      ["i", "markup.italic"],
      ["c", "markup.raw.inline"],
      ["d", "markup.strikethrough"],
      ["t", "markup.link"],
    ])
  })

  test("emphasis across a line break splits onto both rows", () => {
    const rows = renderMarkdown("one **two\nthree** four")
    expect(texts(rows)).toEqual(["one two", "three four"])
    expect(spanned(rows[0]!)).toEqual([["two", "markup.strong"]])
    expect(spanned(rows[1]!)).toEqual([["three", "markup.strong"]])
  })

  test("escapes draw the character they escape", () => {
    expect(texts(renderMarkdown("not \\*em\\*"))).toEqual(["not *em*"])
  })

  test("bullets, numbers and task boxes mark list items, nested lists indent by two", () => {
    const rows = renderMarkdown("- one\n  more\n- [ ] open\n  - [x] done\n\n3. three\n4. four")
    expect(texts(rows)).toEqual(["• one", "  more", "☐ open", "  ☑ done", "", "3. three", "4. four"])
    expect(lines(rows)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(spanned(rows[0]!)).toEqual([["• ", "markup.list"]])
    expect(spanned(rows[3]!)).toEqual([["☑ ", "markup.list"]])
    expect(spanned(rows[5]!)).toEqual([["3. ", "markup.list"]])
  })

  test("inline markup inside a list item keeps its columns after the bullet", () => {
    const [row] = renderMarkdown("- a **b**")
    expect(row!.text).toBe("• a b")
    expect(spanned(row!)).toEqual([
      ["• ", "markup.list"],
      ["b", "markup.strong"],
    ])
  })

  test("a quote prefixes its children with a bar and keeps their lines", () => {
    const rows = renderMarkdown("> quoted *text*\n>\n> - item")
    expect(texts(rows)).toEqual(["│ quoted text", "│ ", "│ • item"])
    expect(lines(rows)).toEqual([1, 2, 3])
    expect(spanned(rows[0]!)).toEqual([
      ["│ ", "markup.quote"],
      ["text", "markup.italic"],
    ])
  })

  test("a rule is a fixed row of box lines", () => {
    expect(renderMarkdown("---")).toEqual([{ text: "─".repeat(40), sourceLine: 1, spans: [] }])
  })

  test("a fenced block draws its content, not its fences", () => {
    const rows = renderMarkdown("```ts\nconst a = 1\n\nconst b = 2\n```")
    expect(texts(rows)).toEqual(["const a = 1", "", "const b = 2"])
    expect(lines(rows)).toEqual([2, 3, 4])
    expect(rows.every((row) => !row.text.startsWith("```"))).toBe(true)
    expect(spanned(rows[0]!)).toEqual([["const a = 1", "markup.raw.block"]])
  })

  test("a fenced block in a known language carries its block for a parse of its own", () => {
    const rows = renderMarkdown("```ts\nconst a = 1\n\nconst b = 2\n```")
    const block = "const a = 1\n\nconst b = 2\n"
    expect(rows.map((row) => row.code)).toEqual([
      { filetype: "typescript", block, at: 0 },
      { filetype: "typescript", block, at: 1 },
      { filetype: "typescript", block, at: 2 },
    ])
    expect(spanned(rows[0]!)).toEqual([["const a = 1", "markup.raw.block"]])
  })

  test("a block with no language, an indented block and a mermaid block carry no parse", () => {
    for (const source of ["```\nconst a = 1\n```", "para\n\n    const a = 1", "```mermaid\ngraph TD\n```"]) {
      const rows = renderMarkdown(source)
      expect(rows.length).toBeGreaterThan(0)
      expect(rows.every((row) => row.code === undefined)).toBe(true)
    }
  })

  test("a fenced block inside a list item keeps its flat colour in the item's columns", () => {
    const rows = renderMarkdown("- item\n\n  ```ts\n  const a = 1\n  ```")
    const code = rows.find((row) => row.text.includes("const"))!
    expect(code.text).toBe("  const a = 1")
    expect(spanned(code)).toEqual([["const a = 1", "markup.raw.block"]])
    expect(code.code).toBeUndefined()
  })

  test("a mermaid block draws its diagram, every row on the opening fence", () => {
    const rows = renderMarkdown("intro\n\n```mermaid\ngraph TD\nA-->B\n```\nafter")
    const drawing = renderMermaid("graph TD\nA-->B").lines
    expect(drawing.length).toBeGreaterThan(0)
    expect(texts(rows)).toEqual(["intro", "", ...drawing, "after"])
    const diagram = rows.slice(2, -1)
    expect(diagram.every((row) => row.sourceLine === 3 && row.lastLine === 6)).toBe(true)
    expect(diagram.map((row) => row.part)).toEqual(drawing.map((_, index) => index))
    expect(diagram.every((row) => row.code === undefined && row.spans.length === 0)).toBe(true)
    expect(rows.at(-1)).toEqual({ text: "after", sourceLine: 7, spans: [] })
  })

  test("a mermaid fence is told by its first word in any case", () => {
    const rows = renderMarkdown("```Mermaid title\ngraph TD\nA-->B\n```")
    expect(texts(rows)).toEqual(renderMermaid("graph TD\nA-->B").lines)
  })

  test("an unclosed mermaid block's rows stand for every line to the end", () => {
    const rows = renderMarkdown("```mermaid\ngraph TD\nA-->B")
    expect(rows.every((row) => row.sourceLine === 1 && row.lastLine === 3)).toBe(true)
  })

  test("a mermaid block riff cannot draw, or an empty one, stays its source block", () => {
    expect(renderMarkdown('```mermaid\npie\n"a": 1\n```')).toEqual(renderMarkdown('```\npie\n"a": 1\n```'))
    expect(renderMarkdown("```mermaid\n```")).toEqual(renderMarkdown("```\n```"))
    expect(texts(renderMarkdown("```mermaid\ngraph TD\n```"))).toEqual(["graph TD"])
  })

  test("a blank line inside a drawn mermaid block adds no row", () => {
    const rows = renderMarkdown("```mermaid\ngraph TD\n\nA-->B\n```")
    expect(texts(rows)).toEqual(renderMermaid("graph TD\n\nA-->B").lines)
    expect(rows.every((row) => row.sourceLine === 1)).toBe(true)
  })

  test("a mermaid block inside a list item is drawn in the item's columns", () => {
    const rows = renderMarkdown("- item\n\n  ```mermaid\n  graph TD\n  A-->B\n  ```")
    const drawing = renderMermaid("graph TD\nA-->B").lines
    const diagram = rows.filter((row) => row.sourceLine === 3)
    expect(diagram.map((row) => row.text)).toEqual(drawing.map((line) => `  ${line}`))
    expect(diagram.map((row) => row.part)).toEqual(drawing.map((_, index) => index))
  })

  test("an indented block loses its four-space indent", () => {
    const rows = renderMarkdown("para\n\n    code here\n      nested")
    expect(texts(rows)).toEqual(["para", "", "code here", "  nested"])
    expect(lines(rows)).toEqual([1, 2, 3, 4])
  })

  test("a table is aligned as the diff aligns it, delimiter row included", () => {
    const rows = renderMarkdown("| a | b |\n|---|---|\n| 1 | 22 |")
    expect(texts(rows)).toEqual(["| a   | b   |", "| --- | --- |", "| 1   | 22  |"])
    expect(lines(rows)).toEqual([1, 2, 3])
  })

  test("html stays as its source lines", () => {
    const rows = renderMarkdown("<details>\n<summary>x</summary>\n</details>")
    expect(texts(rows)).toEqual(["<details>", "<summary>x</summary>", "</details>"])
    expect(lines(rows)).toEqual([1, 2, 3])
  })

  test("every row of a mixed document sits on its source line", () => {
    const source = [
      "# Guide", // 1
      "", // 2
      "Some **bold** and", // 3
      "a second line.", // 4
      "", // 5
      "- one", // 6
      "- [x] two", // 7
      "  - nested", // 8
      "", // 9
      "> quoted", // 10
      "", // 11
      "```ts", // 12
      "const a = 1", // 13
      "```", // 14
      "", // 15
      "| a | b |", // 16
      "|---|---|", // 17
      "| 1 | 22 |", // 18
      "", // 19
      "---", // 20
      "", // 21
      "<div>hi</div>", // 22
    ].join("\n")

    expect(renderMarkdown(source).map((row) => [row.sourceLine, row.text])).toEqual([
      [1, "Guide"],
      [2, ""],
      [3, "Some bold and"],
      [4, "a second line."],
      [5, ""],
      [6, "• one"],
      [7, "☑ two"],
      [8, "  • nested"],
      [9, ""],
      [10, "│ quoted"],
      [11, ""],
      [13, "const a = 1"],
      [15, ""],
      [16, "| a   | b   |"],
      [17, "| --- | --- |"],
      [18, "| 1   | 22  |"],
      [19, ""],
      [20, "─".repeat(40)],
      [21, ""],
      [22, "<div>hi</div>"],
    ])
  })

  test("an empty document renders no rows", () => {
    expect(renderMarkdown("")).toEqual([])
  })
})

describe("isMarkdownFile", () => {
  test("knows the markdown extensions and nothing else", () => {
    expect(isMarkdownFile("README.md")).toBe(true)
    expect(isMarkdownFile("docs/a.MARKDOWN")).toBe(true)
    expect(isMarkdownFile("page.mdx")).toBe(true)
    expect(isMarkdownFile("src/app.ts")).toBe(false)
    expect(isMarkdownFile("md")).toBe(false)
  })
})
