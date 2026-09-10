import { test, expect, describe } from "bun:test"
import { linkAt, resolveCandidates } from "./links"

describe("linkAt", () => {
  const line = "Decisions: [ADR-017](../decisions/ADR-017-alert.md), [ADR-019](./b.md)."

  test("takes the target when the cursor is on the label", () => {
    expect(linkAt(line, line.indexOf("ADR-017"))).toEqual({
      kind: "path",
      target: "../decisions/ADR-017-alert.md",
    })
  })

  test("takes it from inside the parentheses too", () => {
    expect(linkAt(line, line.indexOf("decisions"))).toEqual({
      kind: "path",
      target: "../decisions/ADR-017-alert.md",
    })
  })

  test("picks the link the cursor is actually on", () => {
    expect(linkAt(line, line.indexOf("ADR-019"))).toEqual({ kind: "path", target: "./b.md" })
  })

  test("is nothing between the links", () => {
    expect(linkAt(line, line.indexOf("Decisions"))).toBeNull()
  })

  test("reads a markdown link with a title", () => {
    expect(linkAt('see [docs](guide.md "The guide") now', 6)).toEqual({
      kind: "path",
      target: "guide.md",
    })
  })

  test("reads a url, in a link or bare", () => {
    expect(linkAt("[home](https://x.test/a)", 3)).toEqual({
      kind: "url",
      target: "https://x.test/a",
    })
    const bare = "see https://x.test/a?q=1 for more"
    expect(linkAt(bare, bare.indexOf("x.test"))).toEqual({
      kind: "url",
      target: "https://x.test/a?q=1",
    })
  })

  test("reads a bare path, with its line number", () => {
    const text = "  see src/app.ts:42 for the wiring"
    expect(linkAt(text, text.indexOf("src/"))).toEqual({
      kind: "path",
      target: "src/app.ts",
      line: 42,
    })
  })

  test("reads GitHub's #L suffix", () => {
    const text = "docs/guide.md#L12"
    expect(linkAt(text, 0)).toEqual({ kind: "path", target: "docs/guide.md", line: 12 })
  })

  test("drops a section anchor, keeping the file", () => {
    const text = "[why](../adr/001.md#the-reason)"
    expect(linkAt(text, 2)).toEqual({ kind: "path", target: "../adr/001.md" })
  })

  test("leaves the sentence's punctuation out of the path", () => {
    const text = "changed in src/app.ts, then reverted."
    expect(linkAt(text, text.indexOf("src/"))).toEqual({ kind: "path", target: "src/app.ts" })
  })

  test("is nothing on prose", () => {
    const text = "the quick brown fox"
    expect(linkAt(text, 5)).toBeNull()
    expect(linkAt(text, 0)).toBeNull()
  })

  test("is nothing off the end of the line", () => {
    expect(linkAt("short", 99)).toBeNull()
    expect(linkAt("", 0)).toBeNull()
  })
})

describe("resolveCandidates", () => {
  test("an explicitly relative target resolves against its file's directory", () => {
    expect(resolveCandidates("../decisions/ADR-017.md", "docs/guides/import.md")).toEqual([
      "docs/decisions/ADR-017.md",
    ])
    expect(resolveCandidates("./sibling.md", "docs/guides/import.md")).toEqual([
      "docs/guides/sibling.md",
    ])
  })

  test("a plain target could be either, and says so in order", () => {
    expect(resolveCandidates("src/app.ts", "docs/guides/import.md")).toEqual([
      "docs/guides/src/app.ts",
      "src/app.ts",
    ])
  })

  test("reads a leading slash as the repo root", () => {
    expect(resolveCandidates("/src/app.ts", "docs/guides/import.md")).toEqual(["src/app.ts"])
  })

  test("does not repeat itself for a file at the root", () => {
    expect(resolveCandidates("docs/a.md", "README.md")).toEqual(["docs/a.md"])
  })
})
