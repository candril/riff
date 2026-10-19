import { describe, expect, test } from "bun:test"
import { commits, PR_NOW, previews } from "../testing/pr-info"
import { theme } from "../theme"
import type { DiffFile } from "../utils/diff-parser"
import type { PreviewRow } from "../utils/previews"
import { commitRowCount, commitRows, fileRows, previewRows, type ListRows } from "./pr-info-list-rows"

const NO_LABELS: ReadonlyMap<string, string> = new Map()
const none = { selected: -1, labels: NO_LABELS }
const texts = (list: ListRows) => list.rows.map((row) => row.segments.map((segment) => segment.text).join(""))

const app = (name: string): PreviewRow => ({ app: name, links: [{ label: "preview", url: "https://x" }] })

const file = (filename: string, additions = 1, deletions = 0): DiffFile => ({
  filename,
  additions,
  deletions,
  status: "modified",
  content: "",
})

describe("previewRows", () => {
  test("pads the app column to twelve when every app is short", () => {
    expect(texts(previewRows(previews().rows, none))).toEqual(["web         preview  storybook  #812", "admin       on demand"])
  })

  test("measures a wide emoji as two columns", () => {
    const [row] = previewRows([app("🚀🚀🚀🚀🚀🚀")], none).rows
    // Six emoji are twelve columns, plus two: fourteen, past the floor of twelve.
    expect(row!.segments[0]!.text).toBe("🚀🚀🚀🚀🚀🚀  ")
  })

  test("caps the app column at twenty-eight, leaving a forty-character app one space", () => {
    const long = "a".repeat(40)
    const list = previewRows([app(long), app("web")], none)
    expect(list.rows[0]!.segments[0]!.text).toBe(`${long} `)
    expect(list.rows[1]!.segments[0]!.text).toBe("web".padEnd(28))
  })

  test("draws links blue, a status overlay0, a built label overlay0", () => {
    const [web, admin] = previewRows(previews().rows, none).rows
    expect(web!.segments.map((s) => s.fg)).toEqual([theme.subtext1, theme.blue, theme.overlay0])
    expect(admin!.segments.map((s) => s.fg)).toEqual([theme.subtext1, theme.overlay0])
  })

  test("draws the selected app in text", () => {
    const list = previewRows(previews().rows, { ...none, selected: 1 })
    expect(list.rows.map((row) => row.selected)).toEqual([false, true])
    expect(list.rows[1]!.segments[0]!.fg).toBe(theme.text)
  })

  test("says there are none", () => {
    expect(previewRows([], none)).toEqual({ rows: [], note: "No preview links in this PR's conversation" })
  })
})

describe("fileRows", () => {
  test("lines the counts up after the longest name", () => {
    expect(texts(fileRows([file("a.ts", 3, 1), file("src/longer.ts", 12, 0)], { ...none, listWidth: 93 }))).toEqual([
      "a.ts             +3    -1",
      "src/longer.ts   +12    -0",
    ])
  })

  test("caps the name column at what listWidth leaves the counts, cutting longer names", () => {
    const list = fileRows([file("a".repeat(40)), file("b.ts")], { ...none, listWidth: 30 })
    expect(list.rows[0]!.segments[0]!.text).toBe(`${"a".repeat(17)}…`)
    expect(list.rows[1]!.segments[0]!.text).toBe("b.ts".padEnd(18))
  })

  test("colours the name subtext1, text when selected, and the counts green and red", () => {
    const list = fileRows([file("a.ts"), file("b.ts")], { ...none, selected: 0, listWidth: 93 })
    expect(list.rows[0]!.segments.map((s) => s.fg)).toEqual([theme.text, theme.green, theme.red])
    expect(list.rows[1]!.segments[0]!.fg).toBe(theme.subtext1)
    expect(list.rows.map((row) => row.selected)).toEqual([true, false])
  })

  test("puts a flash label on the row its index names", () => {
    const list = fileRows([file("a.ts"), file("b.ts")], { ...none, listWidth: 93, labels: new Map([["files:0", "sd"], ["commits:1", "x"]]) })
    expect(list.rows.map((row) => row.label)).toEqual(["sd", undefined])
  })

  test("says there are none", () => {
    expect(fileRows([], { ...none, listWidth: 93 })).toEqual({ rows: [], note: "No files changed" })
  })
})

describe("commitRows", () => {
  const input = { ...none, terminalWidth: 120, now: PR_NOW.getTime() }

  test("lists twenty and counts the rest", () => {
    const list = commitRows(commits(23), input)
    expect(list.rows).toHaveLength(20)
    expect(list.note).toBe("... +3 more")
    expect(texts(list)[1]).toBe("22h     c01abcd fix: step 1")
  })

  test("adds no note at twenty or fewer", () => {
    expect(commitRows(commits(20), input).note).toBeNull()
  })

  test("cuts the message to the terminal's width less twenty, never under twenty", () => {
    expect(commitRows(commits(1), input).rows[0]!.segments[2]!.text).toHaveLength(100)
    expect(commitRows(commits(1), { ...input, terminalWidth: 30 }).rows[0]!.segments[2]!.text).toHaveLength(20)
  })

  test("colours the sha peach and the message text when selected, yellow and subtext1 otherwise", () => {
    const [selected, other] = commitRows(commits(2), { ...input, selected: 0 }).rows
    expect(selected!.segments.map((s) => s.fg)).toEqual([theme.subtext0, theme.peach, theme.text])
    expect(other!.segments.map((s) => s.fg)).toEqual([theme.subtext0, theme.yellow, theme.subtext1])
  })

  test("labels row 0 from `commits:0`", () => {
    const list = commitRows(commits(2), { ...input, labels: new Map([["commits:0", "a"]]) })
    expect(list.rows[0]!.label).toBe("a")
  })

  test("says there are none", () => {
    expect(commitRows([], input)).toEqual({ rows: [], note: "No commits" })
  })
})

describe("commitRowCount", () => {
  test("counts the rows commitRows draws, which stop at twenty", () => {
    for (const n of [0, 1, 20, 23]) {
      expect(commitRowCount(commits(n))).toBe(commitRows(commits(n), { ...none, terminalWidth: 120 }).rows.length)
    }
    expect(commitRowCount(commits(23))).toBe(20)
  })
})
