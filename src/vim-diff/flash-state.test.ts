import { describe, expect, test } from "bun:test"
import {
  assignLabels,
  findLabelledMatch,
  labelRows,
  remainingRowLabels,
  resolveRowKey,
  FLASH_LABELS,
} from "./flash-state"

/** Build the `getLineContent` a label assignment needs from a line table. */
function content(lines: Record<number, string>) {
  return (line: number) => lines[line] ?? ""
}

describe("assignLabels", () => {
  test("labels the match nearest the cursor first", () => {
    const lines = { 0: "xx foo", 5: "xx foo", 9: "xx foo" }
    const matches = [
      { line: 0, startCol: 3, endCol: 6 },
      { line: 5, startCol: 3, endCol: 6 },
      { line: 9, startCol: 3, endCol: 6 },
    ]

    const labelled = assignLabels({
      matches,
      cursor: { line: 5, col: 0 },
      getLineContent: content(lines),
    })

    // Cursor is on line 5, so that match takes "a"; line 9 is nearer than line 0.
    expect(labelled.map((m) => m.label)).toEqual(["d", "a", "s"])
  })

  test("breaks line ties on column distance", () => {
    const lines = { 2: "foo .... foo" }
    const matches = [
      { line: 2, startCol: 0, endCol: 3 },
      { line: 2, startCol: 9, endCol: 12 },
    ]

    const labelled = assignLabels({
      matches,
      cursor: { line: 2, col: 9 },
      getLineContent: content(lines),
    })

    expect(labelled.map((m) => m.label)).toEqual(["s", "a"])
  })

  test("drops keys that would continue the search instead", () => {
    // "fa" and "fs" are both live continuations of "f", so neither `a` nor
    // `s` may double as a label — typing them has to narrow the pattern.
    const lines = { 0: "fa", 1: "fs" }
    const matches = [
      { line: 0, startCol: 0, endCol: 1 },
      { line: 1, startCol: 0, endCol: 1 },
    ]

    const labelled = assignLabels({
      matches,
      cursor: { line: 0, col: 0 },
      getLineContent: content(lines),
    })

    expect(labelled.map((m) => m.label)).toEqual(["d", "f"])
  })

  test("leaves matches unlabelled once the alphabet runs out", () => {
    const line = "x".repeat(FLASH_LABELS.length + 5)
    const matches = Array.from({ length: FLASH_LABELS.length + 5 }, (_, i) => ({
      line: 0,
      startCol: i,
      endCol: i + 1,
    }))

    const labelled = assignLabels({
      matches,
      cursor: { line: 0, col: 0 },
      getLineContent: content({ 0: line }),
    })

    // "x" follows every match, so it is excluded from the 26-key alphabet.
    expect(labelled.filter((m) => m.label !== null)).toHaveLength(FLASH_LABELS.length - 1)
    expect(labelled.filter((m) => m.label === null)).toHaveLength(6)
  })
})

describe("findLabelledMatch", () => {
  const matches = [
    { line: 0, startCol: 0, endCol: 1, label: "a" },
    { line: 1, startCol: 0, endCol: 1, label: null },
  ]

  test("finds a match by its label", () => {
    expect(findLabelledMatch(matches, "a")?.line).toBe(0)
  })

  test("accepts the uppercase variant", () => {
    expect(findLabelledMatch(matches, "A")?.line).toBe(0)
  })

  test("ignores unlabelled matches", () => {
    expect(findLabelledMatch(matches, "s")).toBeNull()
  })
})

describe("labelling a list's rows", () => {
  const ids = (count: number) => Array.from({ length: count }, (_, i) => String(i))
  const jumpsTo = (rows: ReturnType<typeof labelRows>, keys: string) => {
    let typed = ""
    for (const char of keys) {
      const resolved = resolveRowKey(rows, typed, char)
      if (resolved.kind === "jump") return resolved.row.id
      if (resolved.kind === "cancel") return null
      typed = resolved.typed
    }
    return null
  }

  test("every row gets a label, top to bottom", () => {
    const rows = labelRows(ids(3))

    expect(rows.map((row) => row.label)).toEqual(["a", "s", "d"])
    expect(jumpsTo(rows, "d")).toBe("2")
  })

  test("keys the surface acts on stay out of the alphabet", () => {
    const rows = labelRows(ids(2), "as")

    expect(rows.map((row) => row.label)).toEqual(["d", "f"])
    expect(jumpsTo(rows, "a")).toBeNull()
  })

  test("uppercase jumps too", () => {
    expect(jumpsTo(labelRows(["only"]), "A")).toBe("only")
  })

  test("rows past the alphabet get two-letter labels instead of none", () => {
    const rows = labelRows(ids(40), "vx")

    expect(rows).toHaveLength(40)
    expect(new Set(rows.map((row) => row.label)).size).toBe(40)
    // The top of the list keeps its single keys.
    expect(rows[0]!.label).toBe("a")
    expect(rows.at(-1)!.label).toHaveLength(2)
    expect(rows.every((row) => !/[vx]/.test(row.label))).toBe(true)
  })

  test("no label begins another, so every row is reachable", () => {
    const rows = labelRows(ids(120))

    for (const row of rows) {
      expect(rows.some((other) => other !== row && other.label.startsWith(row.label))).toBe(false)
      expect(jumpsTo(rows, row.label)).toBe(row.id)
    }
  })

  test("a prefix narrows; a key no label continues with cancels", () => {
    const rows = labelRows(ids(40))
    const prefix = rows.at(-1)!.label[0]!

    expect(resolveRowKey(rows, "", prefix)).toEqual({ kind: "narrow", typed: prefix })
    expect(resolveRowKey(rows, prefix, "1")).toEqual({ kind: "cancel" })
  })

  test("after a prefix, only its rows keep a label, and only what is left of it", () => {
    const rows = labelRows(ids(40))
    const last = rows.at(-1)!
    const remaining = remainingRowLabels(rows, last.label[0]!)

    expect(remaining.get(last.id)).toBe(last.label[1])
    expect(remaining.has(rows[0]!.id)).toBe(false)
  })
})
