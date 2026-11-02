import { test, expect, describe } from "bun:test"
import type { SimpleHighlight } from "@opentui/core"
import { renderMarkdown } from "../features/rendered-markdown/render"
import { parseDiff } from "../utils/diff-parser"
import { FileParses, parseHighlights } from "../vim-diff/file-parses"
import { DiffLineMapping } from "../vim-diff/line-mapping"
import { code, diffFile, mappingOf } from "./fixtures"
import { LineSpans, sideOf } from "./line-spans"
import type { CaptureSpan } from "./segments"

interface Call {
  text: string
  filetype: string
  resolve: (highlights: SimpleHighlight[] | null) => void
}

/** A parse that answers only when the test says so. */
function deferredParse() {
  const calls: Call[] = []
  const parse = (text: string, filetype: string) =>
    new Promise<SimpleHighlight[] | null>((resolve) => calls.push({ text, filetype, resolve }))
  return { calls, parse }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

const linesOf = (...files: Parameters<typeof diffFile>[]) =>
  new DiffLineMapping(files.map((file) => diffFile(...file)), "all").allLines

const indexOf = (lines: ReturnType<typeof linesOf>, content: string) =>
  lines.findIndex((line) => line.content === content)

// "one\nTWO\nthree" in b.ts, "one\ntwo\nthree" before it.
const codeLines = () => mappingOf({}, [code]).allLines

describe("sideOf", () => {
  test("a deletion is old, context and an addition are new, a marker follows its line", () => {
    const lines = mappingOf().allLines
    const sides = lines.map((line, index) => [line.type, line.content, sideOf(lines, index)])

    expect(sides).toContainEqual(["deletion", "tail old", "old"])
    expect(sides).toContainEqual(["addition", "TWO", "new"])
    expect(sides).toContainEqual(["context", "one", "new"])
    expect(sides[10]).toEqual(["no-newline", "\\ No newline at end of file", "old"])
    expect(sides[13]).toEqual(["no-newline", "\\ No newline at end of file", "new"])
    expect(sides[20]).toEqual(["no-newline", "\\ No newline at end of file", "new"])
  })

  test("a header or a divider has no side, and no spans are asked for it", () => {
    const { calls, parse } = deferredParse()
    const spans = new LineSpans(new FileParses(parse), parse)
    const lines = codeLines()
    const header = lines.findIndex((line) => line.type === "file-header")
    const divider = lines.findIndex((line) => line.type === "divider")

    expect(sideOf(lines, header)).toBeUndefined()
    expect(sideOf(lines, divider)).toBeUndefined()
    expect(spans.spans(lines, header)).toBeUndefined()
    expect(spans.spans(lines, divider)).toBeUndefined()
    expect(calls).toEqual([])
  })
})

describe("a line's spans from its file's parse", () => {
  test("are cut to the file line, in the line's columns, without a fragment parse", async () => {
    const files = deferredParse()
    const parses = new FileParses(files.parse)
    parses.set(new Map([["b.ts", { new: "one\nTWO\nthree", old: "one\ntwo\nthree" }]]))
    files.calls[0]!.resolve([[0, 3, "variable"], [5, 11, "string"]])
    files.calls[1]!.resolve([[4, 7, "keyword"]])
    await settle()

    const fragments = deferredParse()
    const spans = new LineSpans(parses, fragments.parse)
    const lines = codeLines()

    expect(spans.spans(lines, indexOf(lines, "one"))).toEqual([[0, 3, "variable"]])
    expect(spans.spans(lines, indexOf(lines, "TWO"))).toEqual([[1, 3, "string"]])
    expect(spans.spans(lines, indexOf(lines, "three"))).toEqual([[0, 3, "string"]])
    expect(spans.spans(lines, indexOf(lines, "two"))).toEqual([[0, 3, "keyword"]])
    expect(fragments.calls).toEqual([])
  })

  test("give way to a rendered row's spans, which are in the rendered text's columns", async () => {
    const files = deferredParse()
    const parses = new FileParses(files.parse)
    parses.set(new Map([["b.ts", { new: "one\nTWO\nthree", old: "one\ntwo\nthree" }]]))
    files.calls[0]!.resolve([[0, 3, "variable"]])
    files.calls[1]!.resolve([])
    await settle()

    const spans = new LineSpans(parses, deferredParse().parse)
    const lines = codeLines().map((line) =>
      line.content === "one" ? { ...line, rendered: true as const, renderedSpans: [[0, 2, "markup.strong"] as const] } : line
    )

    expect(spans.spans(lines, indexOf(lines, "one"))).toEqual([[0, 2, "markup.strong"]])
  })
})

describe("a line's spans from its hunk's side", () => {
  test("are parsed once per run and side, the side's lines joined by newlines", async () => {
    const { calls, parse } = deferredParse()
    const spans = new LineSpans(new FileParses(parse), parse)
    let landed = 0
    spans.onSpans = () => landed++
    const lines = codeLines()
    const two = indexOf(lines, "two")
    const upper = indexOf(lines, "TWO")

    expect(spans.spans(lines, two)).toBeUndefined()
    expect(spans.spans(lines, upper)).toBeUndefined()
    expect(spans.spans(lines, indexOf(lines, "one"))).toBeUndefined()
    expect(spans.spans(lines, two)).toBeUndefined()
    expect(calls.map((call) => [call.text, call.filetype])).toEqual([
      ["one\ntwo\nthree\n", "typescript"],
      ["one\nTWO\nthree\n", "typescript"],
    ])

    calls[1]!.resolve([[0, 3, "variable"], [5, 11, "string"]])
    await settle()

    expect(landed).toBe(1)
    expect(spans.spans(lines, indexOf(lines, "one"))).toEqual([[0, 3, "variable"]])
    expect(spans.spans(lines, upper)).toEqual([[1, 3, "string"]])
    expect(spans.spans(lines, indexOf(lines, "three"))).toEqual([[0, 3, "string"]])
    expect(spans.spans(lines, two)).toBeUndefined()
    expect(calls).toHaveLength(2)
  })

  test("are parsed apart for two runs a divider separates", () => {
    const { calls, parse } = deferredParse()
    const spans = new LineSpans(new FileParses(parse), parse)
    const lines = linesOf(["a.ts", ["@@ -1,1 +1,1 @@", " first", "@@ -9,1 +9,1 @@", " second"]])

    spans.spans(lines, indexOf(lines, "first"))
    spans.spans(lines, indexOf(lines, "second"))

    expect(calls.map((call) => call.text)).toEqual(["first\n", "second\n"])
  })

  test("are kept for a rebuilt mapping whose run reads the same", async () => {
    const { calls, parse } = deferredParse()
    const spans = new LineSpans(new FileParses(parse), parse)

    spans.spans(codeLines(), 1)
    calls[0]!.resolve([[0, 3, "variable"]])
    await settle()
    const rebuilt = codeLines()

    expect(spans.spans(rebuilt, 1)).toEqual([[0, 3, "variable"]])
    expect(calls).toHaveLength(1)
  })

  test("drop a keyword the lexer found inside a name", async () => {
    const { calls, parse } = deferredParse()
    const spans = new LineSpans(new FileParses(parse), parse)
    const lines = linesOf(["s.graphql", ["@@ -1,1 +1,1 @@", "   personalized: Boolean"]])

    spans.spans(lines, 1)
    calls[0]!.resolve([[6, 8, "keyword"], [16, 23, "type"]])
    await settle()

    expect(spans.spans(lines, 1)).toEqual([[16, 23, "type"]])
  })

  test("are neither kept nor announced when they land after dispose", async () => {
    const { calls, parse } = deferredParse()
    const spans = new LineSpans(new FileParses(parse), parse)
    let landed = 0
    spans.onSpans = () => landed++
    const lines = codeLines()

    spans.spans(lines, 1)
    spans.dispose()
    calls[0]!.resolve([[0, 3, "variable"]])
    await settle()

    expect(landed).toBe(0)
    expect(spans.spans(lines, 1)).toBeUndefined()
  })

  test("are known to be empty for a file riff has no parser for, or a parse that fails", async () => {
    const { calls, parse } = deferredParse()
    const spans = new LineSpans(new FileParses(parse), parse)
    const unknown = linesOf(["notes.txt", ["@@ -1,1 +1,1 @@", " plain"]])

    expect(spans.spans(unknown, 1)).toEqual([])

    const failing = new LineSpans(new FileParses(parse), () => Promise.reject(new Error("worker gone")))
    const lines = codeLines()
    failing.spans(lines, 1)
    await settle()

    expect(failing.spans(lines, 1)).toEqual([])
    expect(calls).toEqual([])
  })

  test("past the limit, the least recently read run is parsed again", async () => {
    const { calls, parse } = deferredParse()
    const spans = new LineSpans(new FileParses(parse), parse, 2)
    const runs = ["a", "b", "c"].map((name) => linesOf([`${name}.ts`, ["@@ -1,1 +1,1 @@", ` ${name}`]]))

    spans.spans(runs[0]!, 1)
    spans.spans(runs[1]!, 1)
    for (const call of calls) call.resolve([])
    await settle()
    spans.spans(runs[0]!, 1)
    spans.spans(runs[2]!, 1)

    expect(spans.spans(runs[0]!, 1)).toEqual([])
    expect(spans.spans(runs[1]!, 1)).toBeUndefined()
    expect(calls.map((call) => call.text)).toEqual(["a\n", "b\n", "c\n", "b\n"])
  })
})

describe("a rendered code block's spans", () => {
  const README = ["# demo", "", "```ts", "const a = 1", "let b", "```", ""].join("\n")
  const DIFF = [
    "diff --git a/README.md b/README.md",
    "--- a/README.md",
    "+++ b/README.md",
    "@@ -1,1 +1,6 @@",
    " # demo",
    "+",
    "+```ts",
    "+const a = 1",
    "+let b",
    "+```",
    "",
  ].join("\n")
  const renderedLines = () =>
    new DiffLineMapping(parseDiff(DIFF), "all", undefined, {
      outsideDiff: true,
      fileContents: new Map([["README.md", README]]),
      renderedFiles: new Map([["README.md", renderMarkdown(README)]]),
    }).allLines
  const raw = (text: string): CaptureSpan[] => [[0, text.length, "markup.raw.block"]]

  test("keep the flat colour while the block's parse is pending, and two rows ask for one parse", () => {
    const { calls, parse } = deferredParse()
    const spans = new LineSpans(new FileParses(parse), parse)
    const lines = renderedLines()

    expect(spans.spans(lines, indexOf(lines, "const a = 1"))).toEqual(raw("const a = 1"))
    expect(spans.spans(lines, indexOf(lines, "let b"))).toEqual(raw("let b"))
    expect(spans.spans(lines, indexOf(lines, "const a = 1"))).toEqual(raw("const a = 1"))
    expect(calls.map((call) => [call.text, call.filetype])).toEqual([["const a = 1\nlet b\n", "typescript"]])
  })

  test("take the block's parse once it lands, in place of the flat colour", async () => {
    const { calls, parse } = deferredParse()
    const spans = new LineSpans(new FileParses(parse), parse)
    let landed = 0
    spans.onSpans = () => landed++
    const lines = renderedLines()
    spans.spans(lines, indexOf(lines, "const a = 1"))

    calls[0]!.resolve([[0, 5, "keyword"], [10, 11, "number"], [12, 15, "keyword"]])
    await settle()

    expect(landed).toBe(1)
    expect(spans.spans(lines, indexOf(lines, "const a = 1"))).toEqual([[0, 5, "keyword"], [10, 11, "number"]])
    expect(spans.spans(lines, indexOf(lines, "let b"))).toEqual([[0, 3, "keyword"]])
  })

  test("keep the flat colour when the parse fails or answers nothing", async () => {
    for (const fails of [false, true]) {
      const { calls, parse } = deferredParse()
      const fragment = fails ? () => Promise.reject(new Error("worker gone")) : parse
      const spans = new LineSpans(new FileParses(parse), fragment)
      const lines = renderedLines()
      spans.spans(lines, indexOf(lines, "let b"))
      calls[0]?.resolve(null)
      await settle()

      expect(spans.spans(lines, indexOf(lines, "let b"))).toEqual(raw("let b"))
    }
  })
})

describe("a markdown file's fenced ts block, parsed for real", () => {
  const md = [
    "#### Body (`ChangeDisplayNameFamilyRequest`)",
    "",
    "```ts",
    "{",
    "  AccountHolder: familyOwnerId       // AAX keys a family by its owner",
    "  FamilyName: familyName",
    "  RequestHeader: AAXSource.Frontend",
    "}",
    "```",
  ].join("\n")
  const added = parseDiff(
    [
      "diff --git a/doc.md b/doc.md",
      "new file mode 100644",
      "--- /dev/null",
      "+++ b/doc.md",
      "@@ -0,0 +1,9 @@",
      ...md.split("\n").map((line) => `+${line}`),
      "",
    ].join("\n")
  )
  const lines = () => new DiffLineMapping(added, "all").allLines
  const holder = "  AccountHolder: familyOwnerId       // AAX keys a family by its owner"

  const expectTsColours = (spans: readonly CaptureSpan[] | undefined, fence: readonly CaptureSpan[] | undefined) => {
    const comment = holder.indexOf("//")
    expect(spans).toContainEqual([comment, holder.length, "comment"])
    expect(spans).toContainEqual([2, 15, "label"])
    expect(spans?.some(([, , capture]) => capture === "markup.raw.block")).toBe(false)
    expect(fence).toContainEqual([0, 3, "markup.raw.block"])
  }

  test("take the injected language's colours from the file's parse, not the block's green", async () => {
    const parses = new FileParses(parseHighlights)
    const landed = new Promise<void>((resolve) => (parses.onParsed = () => resolve()))
    parses.set(new Map([["doc.md", { new: md, old: null }]]))
    await landed

    const spans = new LineSpans(parses, deferredParse().parse)
    const rows = lines()

    expectTsColours(spans.spans(rows, indexOf(rows, holder)), spans.spans(rows, indexOf(rows, "```ts")))
  })

  test("take them from the hunk's parse when riff has no file parse", async () => {
    const spans = new LineSpans(new FileParses(async () => null), parseHighlights)
    const landed = new Promise<void>((resolve) => (spans.onSpans = () => resolve()))
    const rows = lines()
    expect(spans.spans(rows, indexOf(rows, holder))).toBeUndefined()
    await landed

    expectTsColours(spans.spans(rows, indexOf(rows, holder)), spans.spans(rows, indexOf(rows, "```ts")))
  })
})
