import { afterEach, describe, expect, test } from "bun:test"
import type { SimpleHighlight } from "@opentui/core"
import { jumpScenario, KEY, type JumpScenario } from "../testing/jump-scenarios"
import { VimMotionHandler } from "../vim-diff/motion-handler"
import { matchingBracketFor } from "../features/matching-bracket"
import { toLineState, toRowState } from "./split-cursor"
import type { FileParse } from "../vim-diff/file-parses"

/*
 * `%` and `gm` through riff's real keys (spec 012, "Matching bracket"): the
 * diff's motion handler wired as app.ts wires it, split rows included, over
 * a file whose text riff has read, with a string's bracket in the way.
 */

const FILE = "src/brace.ts"
const N = 100

function fileLine(n: number, side: "new" | "old"): string {
  if (n === 1) return "export function outer() {"
  if (n === 3) return '  log("}")'
  if (n === 4) return side === "old" ? "  old(" : "  fresh(1)"
  if (n === 5) return side === "old" ? "  )" : "  done()"
  if (n === 6) return "  if (a) {"
  if (n === 20 || n === 62) return "  }"
  if (n === 30) return "  while (b) {"
  if (n === 65 && side === "old") return "  const v65 = 0"
  if (n === 70) return "}"
  if (n === 99) return "export const tail = 1"
  if (n === 100) return "// end"
  if ((n > 6 && n < 20) || (n > 30 && n < 62)) return `    step${n}()`
  return `  const v${n} = ${n}`
}

const text = (side: "new" | "old") => Array.from({ length: N }, (_, i) => fileLine(i + 1, side)).join("\n")
const NEW = text("new")
const OLD = text("old")

function hunk(from: number, to: number): string[] {
  const rows = [`@@ -${from},${to - from + 1} +${from},${to - from + 1} @@`]
  for (let n = from; n <= to; n++) {
    const before = fileLine(n, "old")
    const after = fileLine(n, "new")
    if (before === after) rows.push(` ${after}`)
    else if (n === 4) rows.push(`-${before}`, `-${fileLine(5, "old")}`, `+${after}`, `+${fileLine(5, "new")}`)
    else if (n !== 5) rows.push(`-${before}`, `+${after}`)
  }
  return rows
}

/** Lines 1 to 8 and 40 to 100 shown; 9 to 39, the `if` block's end and the `while` included, are collapsed. */
const DIFF = [`diff --git a/${FILE} b/${FILE}`, "index 1111111..2222222 100644", `--- a/${FILE}`, `+++ b/${FILE}`, ...hunk(1, 8), ...hunk(40, 100), ""].join("\n")

const stringIn = (content: string): SimpleHighlight[] => {
  const start = content.indexOf('"}"')
  return [[start, start + 3, "string"]]
}
const PARSE: FileParse = { new: { content: NEW, highlights: stringIn(NEW) }, old: { content: OLD, highlights: stringIn(OLD) } }

let app: JumpScenario | null = null
afterEach(async () => {
  await app?.dispose()
  app = null
})

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

async function scenario({ loaded = true }: { loaded?: boolean } = {}) {
  const loads: string[] = []
  let a!: JumpScenario
  const render = () => a.mounted.ctx
  const split = () => render().split
  const vim = () => a.keys.vimState()
  const vimHandler = new VimMotionHandler({
    getMapping: () => (split().shown() ? split().source() : render().getLineMapping()),
    getState: () => (split().shown() ? toRowState(vim(), split().source()) : vim()),
    setState: (next) => a.keys.setVim(split().shown() ? toLineState(next, split().source(), vim()) : next),
    getViewportHeight: () => 20,
    onCursorMove: () => a.mounted.render(),
    matchBracket: (row, col) =>
      matchingBracketFor({
        getSource: () => (split().shown() ? split().source() : render().getLineMapping()),
        getMapping: () => render().getLineMapping(),
        parses: { get: (filename) => (loaded && filename === FILE ? PARSE : undefined) },
        fileContent: a.mounted.fileContent,
        rebuildLineMapping: () => a.mounted.show({ files: render().getState().files }),
        getVimState: vim,
        setVimState: (next) => a.keys.setVim(next),
        loadFileContent: (filename) => void loads.push(filename),
        toast: a.mounted.toast,
        render: a.mounted.render,
      })(row, col),
  })
  a = await jumpScenario({ diff: DIFF, more: { vimHandler } })
  app = a
  if (loaded) {
    a.mounted.fileContent.set(FILE, NEW, OLD)
    a.mounted.show({ files: a.state().files })
  }
  a.mounted.show({ showFilePanel: false })
  await flush()
  return { a, loads }
}

/** The mapping line reading exactly `content`, on `side`'s numbering when it says. */
function lineOf(a: JumpScenario, content: string, nth = 0): number {
  const lines = a.mounted.ctx.getLineMapping().allLines
  const found = lines.flatMap((line, index) => (line.filename === FILE && line.content === content ? [index] : []))
  return found[nth]!
}

const fileLineAt = (a: JumpScenario) => a.mounted.ctx.getLineMapping().getLine(a.where().line)

describe("% and gm", () => {
  test("% on a { lands on its }, past a } in a string, and back", async () => {
    const { a } = await scenario()
    a.moveTo(lineOf(a, "export function outer() {"), 24)
    a.press("%")
    expect(fileLineAt(a)?.newLineNum).toBe(70)
    expect(a.where().col).toBe(0)
    a.press("%")
    expect(fileLineAt(a)?.newLineNum).toBe(1)
    expect(a.where().col).toBe(24)
  })

  test("gm does the same and leaves no chord pending", async () => {
    const { a } = await scenario()
    a.moveTo(lineOf(a, "export function outer() {"), 0)
    // From column 0 the first bracket is `outer(`'s, which closes on its own line.
    a.press("g", "m")
    expect(a.where()).toMatchObject({ text: "export function outer() {", col: 22 })
    expect(a.keys.chordPending()).toBe(false)
    a.press("$", "g", "m")
    expect(fileLineAt(a)?.newLineNum).toBe(70)
    expect(a.keys.chordPending()).toBe(false)
    // Had `m` opened a mark chord, this `k` would name a mark instead of moving up.
    a.press("k")
    expect(a.mounted.marks.marks()).toEqual([])
    expect(fileLineAt(a)?.newLineNum).toBe(69)
  })

  test("a match in collapsed context opens it, lands there, and Ctrl-o comes back", async () => {
    const { a } = await scenario()
    expect(await a.mounted.frame()).not.toContain("step19()")
    a.moveTo(lineOf(a, "  if (a) {"), 9)
    a.press("%")
    await flush()
    expect(fileLineAt(a)).toMatchObject({ newLineNum: 20, content: "  }", expanded: true })
    expect(a.where().col).toBe(2)
    const frame = await a.mounted.frame()
    expect(frame).toContain("step19()")
    expect(frame).toContain("while (b) {")
    a.press(KEY.ctrlO)
    expect(a.where().text).toBe("  if (a) {")
  })

  test("% on a removed row matches in the old text", async () => {
    const { a } = await scenario()
    a.moveTo(lineOf(a, "  old("), 0)
    a.press("%")
    expect(fileLineAt(a)).toMatchObject({ type: "deletion", oldLineNum: 5, content: "  )" })
    expect(a.where().col).toBe(2)
  })

  test("in V mode % extends the selection, its anchor kept when context opens above it", async () => {
    const { a } = await scenario()
    a.moveTo(lineOf(a, "  }"), 2)
    expect(fileLineAt(a)?.newLineNum).toBe(62)
    a.press("V", "%")
    await flush()
    const vim = a.keys.vimState()
    expect(vim.mode).toBe("visual-line")
    expect(fileLineAt(a)?.newLineNum).toBe(30)
    expect(a.mounted.ctx.getLineMapping().getLine(vim.selectionAnchor!)?.newLineNum).toBe(62)
  })

  test("a far match comes to the upper half of the diff", async () => {
    const { a } = await scenario()
    a.moveTo(lineOf(a, "export function outer() {"), 24)
    await a.mounted.frame()
    const before = a.window()
    a.press("%")
    await flush()
    const after = a.window()
    expect(after.row > before.scrollTop + Math.floor(before.height / 2)).toBe(true)
    expect(a.screenRow()).toBeGreaterThanOrEqual(0)
    expect(a.screenRow()).toBeLessThanOrEqual(Math.floor(after.height / 2))
  })

  test("a file not read yet matches within its shown lines, says so and reads the file", async () => {
    const { a, loads } = await scenario({ loaded: false })
    a.moveTo(lineOf(a, "  fresh(1)"), 0)
    a.press("%")
    expect(a.where()).toMatchObject({ text: "  fresh(1)", col: 9 })
    expect(loads).toEqual([FILE])
    expect(a.mounted.toast.current()?.message).toContain("shown lines")
  })
})

describe("% side by side", () => {
  async function splitScenario() {
    const { a } = await scenario()
    a.press("\\")
    await flush()
    expect(a.mounted.ctx.split.shown()).toBe(true)
    return a
  }

  test("the left pane reads the old text", async () => {
    const a = await splitScenario()
    a.moveTo(lineOf(a, "  fresh(1)"), 0)
    // h at a line's start crosses into the left pane.
    a.press("h")
    expect(a.mounted.ctx.split.source().side).toBe("left")
    a.press("%")
    expect(fileLineAt(a)).toMatchObject({ type: "deletion", oldLineNum: 5 })
  })

  test("the right pane reads the new text", async () => {
    const a = await splitScenario()
    a.moveTo(lineOf(a, "export function outer() {"), 24)
    await a.mounted.frame()
    expect(a.mounted.ctx.split.source().side).toBe("right")
    a.press("%")
    expect(fileLineAt(a)?.newLineNum).toBe(70)
  })
})

test("the help overlay lists % / gm", async () => {
  const { a } = await scenario()
  a.press("g", "?")
  const frame = await a.mounted.frame()
  expect(frame).toContain("% / gm")
  expect(frame).toContain("Matching bracket")
})
