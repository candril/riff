import { describe, expect, test } from "bun:test"
import { buildLineMapping } from "./init"
import { createInitialState } from "../state"
import { parseDiff } from "../utils/diff-parser"
import { buildFileTree } from "../utils/file-tree"
import { createDiffOptionsState } from "../features/diff-view/options-state"
import { createFileContentState } from "../features/file-content/state"

const TABLE = `diff --git a/README.md b/README.md
index 1111111..2222222 100644
--- a/README.md
+++ b/README.md
@@ -1,0 +1,3 @@
+| a | b |
+| --- | --- |
+| longer cell | d |
`

const files = parseDiff(TABLE)
const state = createInitialState(files, buildFileTree(files), "test", "")
const padded = (options: Parameters<typeof createDiffOptionsState>[0]) =>
  buildLineMapping(state, createDiffOptionsState(options), createFileContentState()).allLines.some((line) => line.sourceContent !== undefined)

describe("buildLineMapping's table alignment", () => {
  test("pads the table when the options ask for it", () => {
    expect(padded({ wrap: false, alignMarkdownTables: true })).toBe(true)
  })

  test("leaves it as written when the options turn it off", () => {
    expect(padded({ wrap: false, alignMarkdownTables: false })).toBe(false)
  })

  test("leaves it as written while wrapping, whatever the options ask", () => {
    expect(padded({ wrap: true, alignMarkdownTables: true })).toBe(false)
  })
})
