import { test, expect, describe, afterAll } from "bun:test"
import { Box, type CodeRenderable } from "@opentui/core"
import { createTestRenderer } from "@opentui/core/testing"
import { VimDiffView } from "./VimDiffView"
import { DiffLineMapping } from "../vim-diff/line-mapping"
import { createCursorState } from "../vim-diff/cursor-state"
import { parseDiff } from "../utils/diff-parser"

/**
 * A hunk far from the top, so riff draws a collapsed-context divider above
 * it, and GraphQL below — the grammar that made the derailment visible,
 * since `on` is a keyword there (spec 097).
 */
const RAW_DIFF = `diff --git a/schema.graphql b/schema.graphql
index 1111111..2222222 100644
--- a/schema.graphql
+++ b/schema.graphql
@@ -503,4 +503,5 @@ type TvAddOn {
   trackingId: Long @semanticNonNull
+  showSkipAdsChannelList: Boolean @semanticNonNull
   "Catalogue price, before any discount."
   monthlyPrice: Money @semanticNonNull
`

async function mountDiff() {
  const files = parseDiff(RAW_DIFF)
  const { renderer, renderOnce } = await createTestRenderer({ width: 80, height: 16 })

  const shell = Box(
    { id: "shell", width: "100%", height: "100%", flexDirection: "column" },
    Box({ id: "header", width: "100%", height: 1 })
  )
  renderer.root.add(shell)

  const view = new VimDiffView({ renderer })
  ;(renderer.root.findDescendantById("shell") as unknown as { add: (c: unknown) => void })
    .add(view.getContainer())

  const mapping = new DiffLineMapping(files, "all")
  view.update(files, null, mapping, createCursorState(), [], new Map(), null, null)
  await renderOnce()
  await renderOnce()

  const code = renderer.root.findDescendantById("code-0") as CodeRenderable | null
  return { view, mapping, code }
}

const mounted = await mountDiff()

afterAll(() => {
  mounted.view.destroy()
})

describe("the text the highlighter is handed", () => {
  test("the diff has a collapsed-context divider to begin with", () => {
    const types = [...Array(mounted.mapping.lineCount).keys()].map(
      (row) => mounted.mapping.getLine(row)!.type
    )
    expect(types).toContain("divider")
  })

  test("holds none of riff's own chrome", () => {
    const content = mounted.code!.content
    expect(content).not.toContain("▸")
    expect(content).not.toContain("↵")
    expect(content).not.toContain("lines")
    expect(content).not.toContain("rest of the file")
  })

  test("still has one row per mapping row, so nothing downstream moves", () => {
    const rows = mounted.code!.content.split("\n")
    // The section's rows are every mapping row but the file header.
    const sectionRows = mounted.mapping.lineCount - 1
    expect(rows.length).toBe(sectionRows)
  })

  test("leaves the divider's row empty rather than removing it", () => {
    const rows = mounted.code!.content.split("\n")
    const dividers = [...Array(mounted.mapping.lineCount).keys()].filter(
      (row) => mounted.mapping.getLine(row)!.type === "divider"
    )

    expect(dividers.length).toBeGreaterThan(0)
    for (const row of dividers) {
      // One row of the section per mapping row, the file header aside.
      expect(rows[row - 1]).toBe("")
    }
  })
})
