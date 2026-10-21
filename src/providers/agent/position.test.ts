import { expect, test } from "bun:test"
import { formatForAgent } from "./position"

const excerpt = [
  { kind: "context" as const, text: "  const url = new URL(request.url)", oldLine: 17, newLine: 17 },
  { kind: "added" as const, text: "  const target = store.get(slug)", newLine: 18 },
  { kind: "removed" as const, text: "  const target = cache[slug]", oldLine: 18 },
]

test("the block names the place and side and marks the cursor line", () => {
  const block = formatForAgent({
    path: "src/server.ts",
    side: "new",
    line: 18,
    hunkHeader: "@@ -9,6 +10,6 @@",
    excerpt,
    cursorIndex: 1,
    label: "src/server.ts:18",
  })
  expect(block.split("\n")).toEqual([
    "[Reviewer's position: src/server.ts:18 (new side)]",
    "@@ -9,6 +10,6 @@",
    "    17    17    const url = new URL(request.url)",
    ">         18 +  const target = store.get(slug)",
    "    18       -  const target = cache[slug]",
  ])
})

test("on a file header the block names the file alone, with no side or cursor", () => {
  const block = formatForAgent({ path: "src/server.ts", excerpt: [], label: "src/server.ts" })
  expect(block).toBe("[Reviewer's position: src/server.ts]")
})

test("a selection is named as a line range on the position's side", () => {
  const block = formatForAgent({
    path: "src/server.ts",
    side: "new",
    line: 18,
    hunkHeader: "@@ -9,6 +10,6 @@",
    excerpt: excerpt.slice(0, 2),
    cursorIndex: 1,
    label: "src/server.ts:18",
    selection: { start: 17, end: 18 },
  })
  expect(block.split("\n")).toEqual([
    "[Reviewer's position: src/server.ts:18 (new side)]",
    "Selected: src/server.ts:17-18",
    "@@ -9,6 +10,6 @@",
    "    17    17    const url = new URL(request.url)",
    ">         18 +  const target = store.get(slug)",
  ])
})

test("a one-line selection is named as that line", () => {
  const block = formatForAgent({
    path: "src/server.ts",
    side: "new",
    line: 18,
    excerpt: [],
    label: "src/server.ts:18",
    selection: { start: 18, end: 18 },
  })
  expect(block.split("\n")[1]).toBe("Selected: src/server.ts:18")
})

test("on a divider the block names the file and the hunk below, with no line marked", () => {
  const block = formatForAgent({
    path: "src/server.ts",
    hunkHeader: "@@ -9,6 +10,6 @@",
    excerpt: excerpt.slice(0, 1),
    label: "src/server.ts",
  })
  expect(block.split("\n")).toEqual([
    "[Reviewer's position: src/server.ts]",
    "@@ -9,6 +10,6 @@",
    "    17    17    const url = new URL(request.url)",
  ])
})
