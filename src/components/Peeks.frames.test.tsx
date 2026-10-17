import { test, expect, afterEach } from "bun:test"
import { bgAt, fgAt, ints, mountJsx } from "../testing/frame"
import { colors, theme } from "../theme"
import { Peek } from "./Peek"
import { diagramPeekModel, hunkPeekModel, linePeekModel, tablePeekModel, type PeekModel } from "./peek-model"

/*
 * Each peek over a bare 100x30 screen, backdrop included. The expected rows
 * are whole lines, trailing spaces trimmed, so a redraw of the same peek by
 * other means has to match them byte for byte.
 */

let mounted: Awaited<ReturnType<typeof mountJsx>> | null = null

afterEach(async () => {
  await mounted?.dispose()
  mounted = null
})

const SIZE = { width: 100, height: 30 }
const screen = { terminalWidth: SIZE.width, terminalHeight: SIZE.height }
const at = (col: number, text: string) => " ".repeat(col) + text
const blank = (count: number) => Array.from({ length: count }, () => "")

/** The peek in a full-screen host with the dimmed backdrop, as its island draws it. */
async function frame(model: PeekModel) {
  mounted = await mountJsx(
    () => (
      <box position="absolute" top={0} left={0} width="100%" height="100%" justifyContent="center" alignItems="center">
        <box position="absolute" top={0} left={0} width="100%" height="100%" backgroundColor="#00000080" />
        <Peek model={model} />
      </box>
    ),
    SIZE
  )
  return (await mounted.frame()).split("\n")
}

async function emptyBg() {
  const empty = await mountJsx(() => <box />, SIZE)
  await empty.frame()
  const bg = bgAt(empty.setup.captureSpans(), 0, 0)
  await empty.dispose()
  return bg
}

/** The box on base from (left, top), the dimmed backdrop everywhere around it. */
async function expectBox(left: number, top: number, width: number, height: number) {
  const spans = mounted!.setup.captureSpans()
  const dim = bgAt(spans, 0, 0)
  expect(dim).not.toEqual(await emptyBg())
  expect(dim).not.toEqual(ints(theme.base))
  for (const [x, y] of [[SIZE.width - 1, 0], [0, SIZE.height - 1], [SIZE.width - 1, SIZE.height - 1]] as const) {
    expect(bgAt(spans, x, y)).toEqual(dim)
  }
  const right = left + width - 1
  const bottom = top + height - 1
  for (const [x, y] of [[left, top], [right, top], [left, bottom], [right, bottom]] as const) {
    expect(bgAt(spans, x, y)).toEqual(ints(theme.base))
  }
  expect(bgAt(spans, left - 1, top)).toEqual(dim)
  expect(bgAt(spans, right + 1, bottom)).toEqual(dim)
  if (top > 0) expect(bgAt(spans, left, top - 1)).toEqual(dim)
  if (bottom < SIZE.height - 1) expect(bgAt(spans, right, bottom + 1)).toEqual(dim)
}

const fg = (x: number, y: number) => fgAt(mounted!.setup.captureSpans(), x, y)

test("a line peek names the line and its width above the line itself", async () => {
  const rows = await frame(
    linePeekModel({ content: "const answer = 42", lineNumber: 7, filetype: "typescript", ...screen })
  )
  expect(rows).toEqual([...blank(13), at(6, "line 7 17 cols"), "", at(6, "const answer = 42"), "", at(6, "Press gl or Esc to close")])
  await expectBox(4, 12, 92, 7)
  expect(fg(6, 13)).toEqual(ints(colors.primary))
  expect(fg(13, 13)).toEqual(ints(colors.textDim))
  expect(fg(6, 17)).toEqual(ints(colors.textDim))
})

test("a line with no number of its own is just a line", async () => {
  const rows = await frame(linePeekModel({ content: "plain words", ...screen }))
  expect(rows).toEqual([...blank(13), at(6, "line 11 cols"), "", at(6, "plain words"), "", at(6, "Press gl or Esc to close")])
  await expectBox(4, 12, 92, 7)
})

test("a line longer than twenty rows of the box is cut there, with an ellipsis", async () => {
  const content = "abcdefghij".repeat(220)
  const rows = await frame(linePeekModel({ content, lineNumber: 1, ...screen }))
  const wrapped = Array.from({ length: 20 }, (_, i) => at(6, content.slice(i * 88, i * 88 + 88)))
  wrapped[19] = at(6, content.slice(19 * 88, 20 * 88 - 1) + "…")
  expect(rows).toEqual([...blank(3), at(6, "line 1 2200 cols"), "", ...wrapped, "", at(6, "Press gl or Esc to close")])
  await expectBox(4, 2, 92, 26)
})

const TABLE = [
  "┌──────────────────┬───────────────────┐",
  "│ name             │ value             │",
  "├──────────────────┼───────────────────┤",
  "│ answer           │ 42                │",
  "└──────────────────┴───────────────────┘",
]

test("a changed table says which version is on show, and Tab offers the other", async () => {
  const shown = (side: "new" | "old") =>
    frame(tablePeekModel({ lines: TABLE, rowCount: 2, side, hasOther: true, scroll: { row: 0, col: 0 }, ...screen }))

  // The footer is wider than this table, and is cut at the box's edge.
  expect(await shown("new")).toEqual([
    ...blank(11),
    at(30, "table as changed 2 rows"),
    "",
    ...TABLE.map((line) => at(30, line)),
    "",
    at(30, "Tab: previous version · gl or Esc to"),
  ])
  await expectBox(28, 10, 44, 11)
  expect(fg(30, 11)).toEqual(ints(colors.primary))
  expect(fg(36, 11)).toEqual(ints(theme.green))
  expect(fg(47, 11)).toEqual(ints(colors.textDim))
  expect(fg(30, 13)).toEqual(ints(colors.text))
  await mounted!.dispose()

  expect(await shown("old")).toEqual([
    ...blank(11),
    at(30, "table before the change 2 rows"),
    "",
    ...TABLE.map((line) => at(30, line)),
    "",
    at(30, "Tab: current version · gl or Esc to"),
  ])
  expect(fg(36, 11)).toEqual(ints(theme.peach))
})

test("a table bigger than the window says which rows and columns are on show", async () => {
  const lines = Array.from({ length: 40 }, (_, i) => `| row ${String(i + 1).padStart(2, "0")} ${"x".repeat(120)} |`)
  const rows = await frame(
    tablePeekModel({ lines, rowCount: 40, side: "new", hasOther: false, scroll: { row: 3, col: 2 }, ...screen })
  )
  expect(rows).toEqual([
    "",
    at(4, "table 40 rows · rows 4–27 of 40, columns 3–94 of 131"),
    "",
    ...lines.slice(3, 27).map((line) => at(4, line.slice(2, 94))),
    "",
    at(4, "Press gl or Esc to close"),
  ])
  await expectBox(2, 0, 96, 30)
  expect(fg(18, 1)).toEqual(ints(theme.yellow))
})

test("a drawn sequence diagram is titled by its kind and carries its note", async () => {
  const lines = ["Alice ────────── hello ──────────> Bob", "Alice <───────── hi back ───────── Bob"]
  const rows = await frame(
    diagramPeekModel({
      lines,
      source: ["sequenceDiagram"],
      kind: "sequence",
      side: "new",
      hasOther: false,
      note: "2 messages",
      scroll: { row: 0, col: 0 },
      ...screen,
    })
  )
  expect(rows).toEqual([
    ...blank(12),
    at(31, "sequence as changed · 2 messages"),
    "",
    ...lines.map((line) => at(31, line)),
    "",
    at(31, "gl or Esc to close"),
  ])
  await expectBox(29, 11, 42, 8)
  expect(fg(31, 12)).toEqual(ints(colors.primary))
  expect(fg(40, 12)).toEqual(ints(theme.green))
  expect(fg(51, 12)).toEqual(ints(colors.textDim))
})

test("a diagram riff cannot draw shows its source, scrollable, with Tab to the other version", async () => {
  const source = Array.from({ length: 30 }, (_, i) => {
    const n = String(i).padStart(2, "0")
    return `  A${n} --> B${n} %% ${"-".repeat(52)}`
  })
  const rows = await frame(
    diagramPeekModel({ lines: [], source, kind: "unsupported", side: "old", hasOther: true, scroll: { row: 0, col: 0 }, ...screen })
  )
  expect(rows).toEqual([
    "",
    at(16, "mermaid before the change · rows 1–24 of 30 · source"),
    "",
    ...source.slice(0, 24).map((line) => at(16, line)),
    "",
    at(16, "Tab: current version · hjkl to scroll · gl or Esc to close"),
  ])
  await expectBox(14, 0, 73, 30)
  expect(fg(24, 1)).toEqual(ints(theme.peach))
  expect(fg(42, 1)).toEqual(ints(theme.yellow))
  expect(fg(62, 1)).toEqual(ints(colors.textDim))
})

test("a hunk colours its header, removals and additions, under the file's own name", async () => {
  const rows = await frame(
    hunkPeekModel({
      hunk: "@@ -1,3 +1,3 @@\n context\n-old line\n+new line\n",
      filename: "src/app/thing.ts",
      line: 3,
      outdated: false,
      fromRoot: false,
      ...screen,
    })
  )
  expect(rows).toEqual([
    ...blank(11),
    at(28, "thing.ts:3 the code this was written against"),
    "",
    at(28, "@@ -1,3 +1,3 @@"),
    at(28, " context"),
    at(28, "-old line"),
    at(28, "+new line"),
    "",
    at(28, "c or Esc to close"),
  ])
  await expectBox(26, 10, 48, 10)
  expect(fg(28, 11)).toEqual(ints(colors.primary))
  expect(fg(39, 11)).toEqual(ints(colors.textDim))
  expect(fg(28, 13)).toEqual(ints(theme.blue))
  expect(fg(29, 14)).toEqual(ints(colors.text))
  expect(fg(28, 15)).toEqual(ints(theme.red))
  expect(fg(28, 16)).toEqual(ints(theme.green))
})

test("an outdated reply's hunk is the root's, and says so", async () => {
  const rows = await frame(
    hunkPeekModel({ hunk: "@@ -1 +1 @@\n+x", filename: "a.ts", line: 1, outdated: true, fromRoot: true, ...screen })
  )
  expect(rows).toEqual([
    ...blank(12),
    at(14, "a.ts:1 as it was when this was written · from the thread's first comment"),
    "",
    at(14, "@@ -1 +1 @@"),
    at(14, "+x"),
    "",
    at(14, "c or Esc to close"),
  ])
  await expectBox(12, 11, 76, 8)
  expect(fg(21, 12)).toEqual(ints(theme.peach))
  expect(fg(54, 12)).toEqual(ints(colors.textDim))
})

test("a hunk taller than the room keeps its tail, where the comment is", async () => {
  const hunk = ["@@ -1,40 +1,40 @@", ...Array.from({ length: 40 }, (_, i) => `+line ${i + 1}`)].join("\n")
  const rows = await frame(
    hunkPeekModel({ hunk, filename: "a.ts", line: 40, outdated: false, fromRoot: false, ...screen })
  )
  expect(rows).toEqual([
    "",
    at(30, "a.ts:40 the code this was written against"),
    "",
    at(30, "…"),
    ...Array.from({ length: 23 }, (_, i) => at(30, `+line ${i + 18}`)),
    "",
    at(30, "c or Esc to close"),
  ])
  await expectBox(28, 0, 45, 30)
})

test("a hunk row wider than the box is cut with an ellipsis", async () => {
  const rows = await frame(
    hunkPeekModel({ hunk: `@@ -1 +1 @@\n+${"w".repeat(150)}\n`, filename: "a.ts", line: 1, outdated: false, fromRoot: false, ...screen })
  )
  expect(rows).toEqual([
    ...blank(12),
    at(4, "a.ts:1 the code this was written against"),
    "",
    at(4, "@@ -1 +1 @@"),
    at(4, "+" + "w".repeat(90) + "…"),
    "",
    at(4, "c or Esc to close"),
  ])
  await expectBox(2, 11, 96, 8)
})
