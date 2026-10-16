import { DiffLineMapping } from "../vim-diff/line-mapping"
import type { DiffLineMappingOptions } from "../vim-diff/types"
import type { DiffFile } from "../utils/diff-parser"

export function diffFile(filename: string, body: string[]): DiffFile {
  return {
    filename,
    additions: body.filter((line) => line.startsWith("+")).length,
    deletions: body.filter((line) => line.startsWith("-")).length,
    status: "modified",
    content: [
      `diff --git a/${filename} b/${filename}`,
      `--- a/${filename}`,
      `+++ b/${filename}`,
      ...body,
    ].join("\n"),
  }
}

/**
 * Two hunks around a fenced block and an untouched middle run, ending in a
 * last line whose missing newline is fixed on neither side.
 */
export const doc = diffFile("doc.md", [
  "@@ -1,5 +1,6 @@",
  " # Title",
  " intro",
  " ```ts",
  " const a = 1",
  "+const b = 2",
  " ```",
  "@@ -9,2 +10,2 @@",
  "-tail old",
  "-end",
  "\\ No newline at end of file",
  "+tail changed",
  "+end",
  "\\ No newline at end of file",
])

export const docNewFile = [
  "# Title",
  "intro",
  "```ts",
  "const a = 1",
  "const b = 2",
  "```",
  "middle one",
  "middle two",
  "middle three",
  "tail changed",
  "end",
].join("\n")

export const code = diffFile("b.ts", [
  "@@ -1,3 +1,3 @@",
  " one",
  "-two",
  "+TWO",
  " three",
  "\\ No newline at end of file",
])

/** Wraps once at a code width of 55, after "keeps going ", as unified's wrap frame test has it. */
export const LONG_LINE = `  const message = "${"a fairly long line that keeps going ".repeat(2)}"`

export const long = diffFile("long.ts", ["@@ -1,2 +1,3 @@", " {", `+${LONG_LINE}`, " }"])

export const middleDivider = "doc.md:middle:0"

export function mappingOf(options: DiffLineMappingOptions = {}, files = [doc, code]) {
  return new DiffLineMapping(files, "all", undefined, {
    fileContents: new Map([[doc.filename, docNewFile]]),
    ...options,
  })
}

export function fenceId(): string {
  return mappingOf().foldableBlocks.find((block) => block.filename === doc.filename)!.id
}
