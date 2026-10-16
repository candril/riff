import { test, expect } from "bun:test"
import { diffFile } from "../diff-rows/fixtures"
import { FileParses } from "../vim-diff/file-parses"
import { DiffLineMapping } from "../vim-diff/line-mapping"
import { createDiffHighlights } from "./diff-highlights"

const file = diffFile("a.ts", ["@@ -1,1 +1,1 @@", "-const a = 1", "+const a = 2"])
const lines = new DiffLineMapping([file], "all").allLines
const addition = lines.findIndex((line) => line.type === "addition")

/** A fragment parser that answers only when told to, so a test sees the landing happen. */
function heldParse() {
  let answer: (() => void) | null = null
  const parse = () =>
    new Promise<[number, number, string][]>((resolve) => {
      answer = () => resolve([[0, 5, "keyword"]])
    })
  return { parse, land: () => answer?.() }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

test("a parse landing bumps the version once and tells the app", async () => {
  const { parse, land } = heldParse()
  let landings = 0
  const highlights = createDiffHighlights(new FileParses(async () => null), () => landings++, parse)
  expect(highlights.lineSpans.spans(lines, addition)).toBeUndefined()
  expect(highlights.version()).toBe(0)

  land()
  await settle()
  expect(highlights.version()).toBe(1)
  expect(landings).toBe(1)
  expect(highlights.lineSpans.spans(lines, addition)).toEqual([[0, 5, "keyword"]])
})

test("a parse landing after dispose changes nothing", async () => {
  const { parse, land } = heldParse()
  let landings = 0
  const highlights = createDiffHighlights(new FileParses(async () => null), () => landings++, parse)
  highlights.lineSpans.spans(lines, addition)

  highlights.dispose()
  land()
  await settle()
  expect(highlights.version()).toBe(0)
  expect(landings).toBe(0)
})
