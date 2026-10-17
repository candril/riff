import { test, expect, describe, afterEach } from "bun:test"
import { mountRenderable } from "../testing/frame"
import { MarksPicker } from "./MarksPicker"
import type { MarkEntry } from "../features/marks"
import { bgAt, fgAt, ints } from "../testing/split-frame"
import { theme } from "../theme"

let mounted: Awaited<ReturnType<typeof mountRenderable>> | null = null

async function frame(entries: MarkEntry[], selectedIndex = 0) {
  mounted = await mountRenderable(
    (renderer) => MarksPicker({ renderer: renderer as never, entries, selectedIndex, anyMarks: entries.length > 0 }),
    { width: 100, height: 24 }
  )
  return mounted.frame()
}

afterEach(async () => {
  await mounted?.dispose()
  mounted = null
})

const ENTRIES: MarkEntry[] = [
  { mark: { letter: "a", filename: "src/greet.ts", line: 12, side: "RIGHT" }, text: "return template(name)" },
  { mark: { letter: "b", filename: "src/greet.ts", line: 4, side: "LEFT" }, text: "const old = 1" },
  { mark: { letter: "Q", filename: "README.md", line: null, side: "RIGHT" }, text: "" },
]

describe("the marks picker", () => {
  test("lists each mark's letter, place and text, with the count and the delete key", async () => {
    const lines = (await frame(ENTRIES, 1)).split("\n")
    expect(lines.find((l) => l.includes("Marks"))).toMatch(/Marks\s+2\/3  \^x delete  esc/)
    expect(lines.some((l) => /a  src\/greet\.ts:12 return template\(name\)/.test(l))).toBe(true)
    expect(lines.some((l) => /b  src\/greet\.ts:4 const old = 1/.test(l))).toBe(true)
    expect(lines.some((l) => /Q  README\.md$/.test(l))).toBe(true)
  })

  test("paints the selected row and each letter in its accent", async () => {
    const rows = (await frame(ENTRIES, 1)).split("\n")
    const spans = mounted!.setup.captureSpans()
    const selected = rows.findIndex((l) => l.includes("const old"))
    const other = rows.findIndex((l) => l.includes("return template"))
    const x = rows[selected]!.indexOf("src")
    expect(bgAt(spans, x, selected)).toEqual(ints(theme.surface2))
    expect(bgAt(spans, x, other)).not.toEqual(ints(theme.surface2))
    expect(fgAt(spans, rows[other]!.indexOf("a  src"), other)).toEqual(ints(theme.peach))
  })

  test("with no marks, says how to set one", async () => {
    expect(await frame([])).toContain("No marks — m{letter} sets one")
  })
})
