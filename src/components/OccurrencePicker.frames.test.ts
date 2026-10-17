import { test, expect, describe, afterEach } from "bun:test"
import { bgAt, fgAt, ints, mountRenderable } from "../testing/frame"
import { theme } from "../theme"
import { OccurrencePicker } from "./OccurrencePicker"
import { occurrencePickerModel } from "./occurrence-picker-model"
import { findOccurrences, type OccurrenceResults } from "../features/occurrence-picker/filter"
import type { OccurrenceRow } from "../features/occurrence-picker/corpus"

let mounted: Awaited<ReturnType<typeof mountRenderable>> | null = null

async function frame(
  { query, filter = "", narrowing = false, results, selectedIndex = 0 }: {
    query: string
    filter?: string
    narrowing?: boolean
    results?: OccurrenceResults
    selectedIndex?: number
  },
  rows: readonly OccurrenceRow[] = ROWS
) {
  const shown = results ?? findOccurrences(rows, query, filter)
  mounted = await mountRenderable(
    (renderer) =>
      OccurrencePicker({
        renderer: renderer as never,
        model: occurrencePickerModel(query, narrowing, shown, selectedIndex, 34),
      }),
    { width: 100, height: 34 }
  )
  return (await mounted.frame()).split("\n")
}

afterEach(async () => {
  await mounted?.dispose()
  mounted = null
})

function row(filename: string, lineNum: number, text: string, kind: OccurrenceRow["kind"] = "context"): OccurrenceRow {
  return { fileIndex: 0, filename, kind, lineNum, side: kind === "deletion" ? "LEFT" : "RIGHT", text }
}

const ROWS: OccurrenceRow[] = [
  row("src/greet.ts", 2, "const old = greeting", "deletion"),
  row("src/greet.ts", 3, "const greeting = 'hi'", "addition"),
  row("src/greet.ts", 4, "  return greeting"),
  row("src/main.ts", 10, "export const greeting = greet()", "addition"),
  row("src/main.ts", 11, "console.log(name)"),
]

const MANY: OccurrenceRow[] = Array.from({ length: 30 }, (_, i) => row("src/long.ts", i + 1, `hit number ${i}`))

describe("the occurrence picker", () => {
  test("lists each hit under a header per file, with the file's count, and counts them all in the title", async () => {
    const lines = await frame({ query: "greeting" })
    const title = lines.find((l) => l.includes("Occurrences"))!
    expect(title).toMatch(/Occurrences\s+\^g narrow  4 in 2 files  esc$/)
    expect(title.indexOf("Occurrences")).toBe(12)
    expect(title.length).toBe(88)
    const text = lines.join("\n")
    expect(text).toMatch(/src\/greet\.ts\s+3\n/)
    expect(text).toMatch(/src\/main\.ts\s+1\n/)
    expect(text).toContain("     2 - const old = greeting")
    expect(text).toContain("     3 + const greeting = 'hi'")
    expect(text).toContain("     4   return greeting")
    expect(text).toContain("    10 + export const greeting = greet()")
    expect(text).not.toContain("console.log")
  })

  test("draws the match on yellow and the selected hit on surface2", async () => {
    const lines = await frame({ query: "greeting", selectedIndex: 1 })
    const spans = mounted!.setup.captureSpans()
    const selected = lines.findIndex((l) => l.includes("const greeting = 'hi'"))
    const other = lines.findIndex((l) => l.includes("return greeting"))
    const match = lines[other]!.indexOf("greeting")
    expect(bgAt(spans, match, other)).toEqual(ints(theme.yellow))
    expect(fgAt(spans, match, other)).toEqual(ints(theme.crust))
    expect(bgAt(spans, lines[selected]!.indexOf("const"), selected)).toEqual(ints(theme.surface2))
    expect(bgAt(spans, lines[other]!.indexOf("return"), other)).toEqual(ints(theme.mantle))
  })

  test("while narrowing, badges the query in yellow, offers ^g search, and marks the narrow term on teal", async () => {
    const lines = await frame({ query: "greeting", filter: "main", narrowing: true })
    const spans = mounted!.setup.captureSpans()
    const title = lines.findIndex((l) => l.includes("Occurrences"))
    expect(lines[title]).toMatch(/Occurrences  greeting ›\s+\^g search  1 in 1 file  esc$/)
    expect(fgAt(spans, lines[title]!.indexOf("greeting ›"), title)).toEqual(ints(theme.yellow))
    const header = lines.findIndex((l) => l.includes("src/main.ts"))
    expect(bgAt(spans, lines[header]!.indexOf("main"), header)).toEqual(ints(theme.teal))
    expect(fgAt(spans, lines[header]!.indexOf("src/"), header)).toEqual(ints(theme.blue))
    expect(lines.join("\n")).not.toContain("src/greet.ts")
  })

  test("says how many it lists of how many when the hits are capped", async () => {
    const results = findOccurrences(MANY, "hit", "", 25)
    const lines = await frame({ query: "hit", results }, MANY)
    expect(lines.find((l) => l.includes("Occurrences"))).toMatch(/first 25 of 30 in 1 file  esc$/)
  })

  test("says so when nothing in the diff matches", async () => {
    const lines = await frame({ query: "nowhere" })
    expect(lines.find((l) => l.includes("Occurrences"))).toMatch(/Occurrences\s+\^g narrow  0 in 0 files  esc$/)
    expect(lines.some((l) => l.trim() === "No matches in the diff")).toBe(true)
  })

  test("with nothing typed, counts nothing and says nothing", async () => {
    const lines = await frame({ query: "" })
    // The empty count still takes its place between the gaps.
    expect(lines.find((l) => l.includes("Occurrences"))).toMatch(/Occurrences\s+\^g narrow {5}esc$/)
    expect(lines.join("\n")).not.toContain("No matches")
  })

  test("scrolled past the top, puts the file's header in place of the first hit in view", async () => {
    const lines = await frame({ query: "hit", selectedIndex: 20 }, MANY)
    const text = lines.join("\n")
    // 31 rows (a header and 30 hits) in a window of 20 around row 21: rows 11 to 30.
    expect(text).toContain("↑ 11 more")
    expect(text).not.toContain("↓")
    expect(text).toMatch(/↑ 11 more\n\s+src\/long\.ts\s+30\n\s+12   hit number 11\n/)
    expect(text).not.toContain("hit number 10\n")
    expect(text).toContain("hit number 29")
  })

  test("brings a match far to the right into view behind a leading …", async () => {
    const long = `${"x".repeat(70)} needle here`
    const lines = await frame({ query: "needle" }, [row("src/wide.ts", 1, long)])
    const hit = lines.find((l) => l.includes("needle"))!
    expect(hit).toContain(`     1   …${"x".repeat(46)} needle here`)
  })
})
