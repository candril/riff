import { describe, expect, test } from "bun:test"
import type { LineBlame } from "../providers/blame/source"
import { blamePeekModel, type BlamePeekInput } from "./blame-peek-model"
import type { PeekModel } from "./peek-model"

const NOW = Date.parse("2026-10-21T12:00:00Z")
const target = { path: "src/cart.ts", side: "head" as const, line: 42 }
const screen = { terminalWidth: 100, terminalHeight: 30 }

const commit = (subject = "Round totals once, at checkout"): LineBlame["line"] => ({
  kind: "commit",
  commit: { sha: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678", shortSha: "a1b2c3d4", author: "Ada Lovelace", date: "2026-10-18T09:30:00Z", subject },
})
const withPr: LineBlame = { line: commit(), pr: { number: 123, url: "https://github.com/o/r/pull/123" } }
const noPr: LineBlame = { line: commit(), pr: null }

const model = (overrides: Partial<BlamePeekInput> & Pick<BlamePeekInput, "status">) =>
  blamePeekModel({ target, now: NOW, ...screen, ...overrides } as BlamePeekInput)

const lines = (peek: PeekModel) => {
  if (peek.body.kind !== "lines") throw new Error("expected lines")
  return peek.body.lines
}
const texts = (peek: PeekModel) => lines(peek).map((line) => line.map((segment) => segment.text).join(" "))

describe("blamePeekModel", () => {
  test("names the path and line, and the side in its colour, on mantle", () => {
    const peek = model({ status: "loading" })
    expect(peek.header).toEqual([
      { text: "src/cart.ts:42", tone: "primary" },
      { text: "head", tone: "green" },
    ])
    expect(peek.background).toBe("mantle")
    expect(model({ status: "loading", target: { ...target, side: "base" } }).header[1]).toEqual({ text: "base", tone: "peach" })
  })

  test("while loading it says so and offers only closing", () => {
    const peek = model({ status: "loading" })
    expect(lines(peek)).toEqual([[{ text: "Reading blame…", tone: "dim" }]])
    expect(peek.footer).toBe("Esc: close")
  })

  test("a commit with a PR shows sha and author, date, subject and the PR, and offers opening the PR", () => {
    const peek = model({ status: "ready", result: withPr })
    expect(lines(peek)).toEqual([
      [{ text: "a1b2c3d4", tone: "peach" }, { text: "Ada Lovelace", tone: "text" }],
      [{ text: "2026-10-18 (3d ago)", tone: "dim" }],
      [{ text: "Round totals once, at checkout", tone: "text" }],
      [{ text: "#123", tone: "blue" }],
    ])
    expect(peek.footer).toBe("go: open PR #123 · y: copy sha · Esc: close")
  })

  test("a commit with no PR offers opening the commit", () => {
    const peek = model({ status: "ready", result: noPr })
    expect(texts(peek)).toEqual(["a1b2c3d4 Ada Lovelace", "2026-10-18 (3d ago)", "Round totals once, at checkout"])
    expect(peek.footer).toBe("go: open commit · y: copy sha · Esc: close")
  })

  test("a line not yet committed says so", () => {
    const peek = model({ status: "ready", result: { line: { kind: "uncommitted" }, pr: null } })
    expect(lines(peek)).toEqual([[{ text: "Not committed yet", tone: "yellow" }]])
    expect(peek.footer).toBe("Esc: close")
  })

  test("a line with no blame says the file is not on this side", () => {
    const peek = model({ status: "ready", result: null })
    expect(lines(peek)).toEqual([[{ text: "No blame for this line: the file is not on this side", tone: "dim" }]])
    expect(peek.footer).toBe("Esc: close")
  })

  test("a failure shows its message in red", () => {
    const peek = model({ status: "error", message: "jj: no such revision" })
    expect(lines(peek)).toEqual([[{ text: "jj: no such revision", tone: "red" }]])
    expect(peek.footer).toBe("Esc: close")
  })

  test("a long subject is cut to the body's width at 50 columns", () => {
    const subject = "A subject long enough that a fifty column terminal cannot hold it on one row"
    const peek = model({ status: "ready", result: { line: commit(subject), pr: null }, terminalWidth: 50 })
    expect(peek.width).toBe(46)
    const shown = texts(peek)[2]!
    expect(shown).toHaveLength(42)
    expect(shown.endsWith("…")).toBe(true)
    expect(subject.startsWith(shown.slice(0, -1))).toBe(true)
  })

  test("the width stays inside a 40 column terminal and grows to its content on a 200 column one", () => {
    expect(model({ status: "ready", result: withPr, terminalWidth: 40 }).width).toBe(36)
    expect(model({ status: "loading", terminalWidth: 200 }).width).toBe(48)
    const subject = "x".repeat(300)
    expect(model({ status: "ready", result: { line: commit(subject), pr: null }, terminalWidth: 200 }).width).toBe(120)
    const seventy = "y".repeat(70)
    expect(model({ status: "ready", result: { line: commit(seventy), pr: null }, terminalWidth: 200 }).width).toBe(74)
  })
})
