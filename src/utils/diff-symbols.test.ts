import { describe, expect, test } from "bun:test"
import { parseDiff } from "./diff-parser"
import { collectSymbolCandidates, detectSymbolTrigger } from "./diff-symbols"

const at = (text: string) => detectSymbolTrigger(text, text.length)

describe("detectSymbolTrigger", () => {
  test("reads the name begun after an open backtick, and where the backtick is", () => {
    expect(at("change `Fan")).toEqual({ query: "Fan", backtickOffset: 7 })
  })

  test("a bare backtick is not a trigger", () => {
    expect(at("change `")).toBeNull()
  })

  test("a closed span is not a trigger, and a second one opens", () => {
    expect(at("`foo`")).toBeNull()
    expect(at("`foo` to `ba")).toEqual({ query: "ba", backtickOffset: 9 })
  })

  test("a backtick need not follow whitespace", () => {
    expect(at("(`fo")?.query).toBe("fo")
  })

  test("a space closes it: the span is no longer one name", () => {
    expect(at("`foo bar")).toBeNull()
  })

  test("takes the characters of a qualified name or a path", () => {
    expect(at("`a.b::c-d/e")?.query).toBe("a.b::c-d/e")
  })

  test("reads the cursor's position, not the end of the text", () => {
    expect(detectSymbolTrigger("`foo` tail", 3)).toEqual({ query: "fo", backtickOffset: 0 })
  })

  test("only the current line counts", () => {
    expect(at("`foo\nbar")).toBeNull()
    expect(at("first\n`ba")).toEqual({ query: "ba", backtickOffset: 6 })
  })

  test("an escaped backtick opens nothing", () => {
    expect(at("\\`foo")).toBeNull()
  })

  test("a fence line and a double-backtick span are not triggers", () => {
    expect(at("```suggestion")).toBeNull()
    expect(at("``foo")).toBeNull()
  })

  test("nothing inside a fence is a trigger, and after it closes again", () => {
    expect(at("```ts\nuse `fo")).toBeNull()
    expect(at("~~~\nuse `fo")).toBeNull()
    expect(at("```ts\ncode\n```\nuse `fo")?.query).toBe("fo")
  })

  test("a shorter run does not close a fence", () => {
    expect(at("````\n```\nuse `fo")).toBeNull()
  })
})

const DIFF = `diff --git a/src/one.ts b/src/one.ts
index 1111111..2222222 100644
--- a/src/one.ts
+++ b/src/one.ts
@@ -1,3 +1,3 @@
 const contextOnly = 1
-const removedName = 2
+const addedName = 2
 const alsoContext = 3
@@ -20,2 +20,2 @@
-export function secondHunkOld() {}
+export function secondHunkNew() {}
 const moreContext = 4
diff --git a/lib/two.ts b/lib/two.ts
index 1111111..2222222 100644
--- a/lib/two.ts
+++ b/lib/two.ts
@@ -1,1 +1,1 @@
-const otherFileOld = 1
+const otherFileNew = 1
`

describe("collectSymbolCandidates", () => {
  const files = parseDiff(DIFF)
  const inFirstHunk = { filename: "src/one.ts", line: 2, side: "RIGHT" } as const

  test("offers added and removed names and leaves context lines out", () => {
    const candidates = collectSymbolCandidates(files, inFirstHunk)
    expect(candidates).toContain("addedName")
    expect(candidates).toContain("removedName")
    expect(candidates).not.toContain("contextOnly")
  })

  test("drops keywords and short tokens", () => {
    const candidates = collectSymbolCandidates(parseDiff(DIFF.replace("addedName", "ab")), inFirstHunk)
    expect(candidates).not.toContain("const")
    expect(candidates).not.toContain("export")
    expect(candidates).not.toContain("ab")
  })

  test("ranks the commented hunk, its file, the paths, then the other files", () => {
    expect(collectSymbolCandidates(files, inFirstHunk)).toEqual([
      "removedName",
      "addedName",
      "secondHunkOld",
      "secondHunkNew",
      "src/one.ts",
      "one.ts",
      "lib/two.ts",
      "two.ts",
      "otherFileOld",
      "otherFileNew",
    ])
  })

  test("finds the hunk on the side the comment is on", () => {
    const candidates = collectSymbolCandidates(files, { filename: "src/one.ts", line: 20, side: "LEFT" })
    expect(candidates[0]).toBe("secondHunkOld")
  })

  test("a line in no hunk still ranks its own file first", () => {
    const candidates = collectSymbolCandidates(files, { filename: "lib/two.ts", line: 99, side: "RIGHT" })
    expect(candidates[0]).toBe("otherFileOld")
  })

  test("skips a minified line and a file shown unchanged", () => {
    const minified = `+const ${"longMinifiedName ".repeat(200)}`
    const long = parseDiff(DIFF.replace("+const addedName = 2", minified))
    expect(collectSymbolCandidates(long, inFirstHunk)).not.toContain("longMinifiedName")

    const unchanged = files.map((file) => ({ ...file, status: "unchanged" as const }))
    expect(collectSymbolCandidates(unchanged, inFirstHunk)).toEqual([])
  })

  test("stops at its cap, keeping the closest names", () => {
    const manyNames = Array.from({ length: 6000 }, (_, i) => `+const generated${i} = 1`).join("\n")
    const huge = parseDiff(`${DIFF}diff --git a/gen.ts b/gen.ts\n--- a/gen.ts\n+++ b/gen.ts\n@@ -1,6000 +1,6000 @@\n${manyNames}\n`)
    const candidates = collectSymbolCandidates(huge, inFirstHunk)
    expect(candidates).toHaveLength(5000)
    expect(candidates[0]).toBe("removedName")
  })
})
