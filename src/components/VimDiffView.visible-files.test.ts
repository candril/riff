import { test, expect, describe, afterAll } from "bun:test"
import { Box } from "@opentui/core"
import { createTestRenderer } from "@opentui/core/testing"
import { VimDiffView } from "./VimDiffView"
import { DiffLineMapping } from "../vim-diff/line-mapping"
import { createCursorState } from "../vim-diff/cursor-state"
import { parseDiff } from "../utils/diff-parser"
import type { DiffFile } from "../utils/diff-parser"

function file(name: string, body: string[]): string {
  return [
    `diff --git a/${name} b/${name}`,
    `--- a/${name}`,
    `+++ b/${name}`,
    `@@ -1,${body.length} +1,${body.length} @@`,
    ...body,
  ].join("\n")
}

const RAW_DIFF = [
  file("first.ts", [" const a = 1", "-const b = 2", "+const b = 3"]),
  file("second.ts", [" const c = 4", "-const d = 5", "+const d = 6"]),
  file("third.ts", [" const e = 7", "-const f = 8", "+const f = 9"]),
].join("\n")

/** Tall enough for every file, so what is left out is left out on purpose. */
async function mount(height: number, collapsed: Set<string> = new Set()) {
  const files: DiffFile[] = parseDiff(RAW_DIFF)
  const { renderer, renderOnce } = await createTestRenderer({ width: 70, height })

  const shell = Box(
    { id: "shell", width: "100%", height: "100%", flexDirection: "column" },
    Box({ id: "header", width: "100%", height: 1 })
  )
  renderer.root.add(shell)

  const view = new VimDiffView({ renderer })
  ;(renderer.root.findDescendantById("shell") as unknown as { add: (c: unknown) => void })
    .add(view.getContainer())

  const mapping = new DiffLineMapping(files, "all", undefined, { collapsedFiles: collapsed })
  view.update(files, null, mapping, createCursorState(), [], new Map(), null, null)
  await renderOnce()
  await renderOnce()

  return { view, renderer }
}

const all = await mount(40)
const short = await mount(8)
const folded = await mount(40, new Set(["second.ts"]))

afterAll(() => {
  all.view.destroy()
  short.view.destroy()
  folded.view.destroy()
})

describe("the files riff reads for their colours", () => {
  test("is every file with code on screen", () => {
    expect(all.view.visibleFilenames()).toEqual(["first.ts", "second.ts", "third.ts"])
  })

  test("stops at the bottom of the viewport, so a review is not read whole", () => {
    const seen = short.view.visibleFilenames()
    expect(seen.length).toBeGreaterThan(0)
    expect(seen.length).toBeLessThan(3)
    expect(seen[0]).toBe("first.ts")
  })

  test("leaves out a collapsed file, which shows a header and no code", () => {
    expect(folded.view.visibleFilenames()).toEqual(["first.ts", "third.ts"])
  })
})
