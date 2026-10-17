import { test, expect, afterEach, describe } from "bun:test"
import { Text, type BoxRenderable, type CliRenderer } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { FileTreePanel } from "../components/FileTreePanel"
import { InlineCommentOverlay } from "../components/InlineCommentOverlay"
import { commentPanelWidth } from "../features/inline-comment-overlay"
import { bgAt, ints, mountRenderable } from "../testing/frame"
import { mountIsland } from "../testing/unified-island"
import { theme } from "../theme"
import { mainContentRow } from "./content-row"

const TAIL = "TAILMARK"
const LONG = `  const greeting = [first, second, third, fourth, fifth, sixth, seventh, eighth].join(" ") // ${TAIL}`

const DIFF = `diff --git a/greet.ts b/greet.ts
index 1111111..2222222 100644
--- a/greet.ts
+++ b/greet.ts
@@ -1,3 +1,3 @@
 export function greet() {
-  return 1
+${LONG}
 }
`

let disposers: (() => void | Promise<void>)[] = []
afterEach(async () => {
  for (const dispose of disposers) await dispose()
  disposers = []
})

function panel(renderer: CliRenderer, width: number) {
  return InlineCommentOverlay({
    comments: [],
    scopeFilename: "greet.ts",
    composeFilename: "greet.ts",
    line: 0,
    replyToThread: false,
    note: false,
    mode: "view",
    appMode: "local",
    highlightedIndex: 0,
    editingId: null,
    draft: "",
    focused: false,
    expanded: false,
    width,
    mentionPicker: null,
    emojiPicker: null,
    mentionCandidates: [],
    mentionSearchQuery: null,
    expandedThreadIds: new Set(),
    unseenIds: new Set(),
    filter: "",
    filterInput: false,
    flashLabels: new Map(),
    renderer,
  })
}

type Spans = ReturnType<TestRendererSetup["captureSpans"]>

/** Every row of `columns` is drawn on the panel's mantle. */
function expectPanelShadeAt(spans: Spans, columns: number[]) {
  for (let y = 0; y < spans.lines.length; y++) {
    for (const x of columns) expect(bgAt(spans, x, y)).toEqual(ints(theme.mantle))
  }
}

async function mountDocked(width: number, around: (host: BoxRenderable, setup: TestRendererSetup) => ReturnType<typeof mainContentRow>) {
  const mounted = await mountIsland({ raw: DIFF, width, height: 12, wrap: true, around })
  disposers.push(mounted.dispose)
  return mounted
}

describe("the thread panel docked in the content row", () => {
  test("narrows the diff beside it, which wraps its lines clear of the panel", async () => {
    const width = 120
    const panelWidth = commentPanelWidth(width, false)
    const { setup, frame } = await mountDocked(width, (host, setup) => mainContentRow(host, panel(setup.renderer, panelWidth), { withTree: true }))
    const rows = await frame()
    const border = width - panelWidth

    const spans = setup.captureSpans()
    expectPanelShadeAt(spans, [border, width - 1])

    const tailRow = rows.find((row) => row.includes(TAIL))
    expect(tailRow).toBeDefined()
    expect(tailRow!.indexOf(TAIL) + TAIL.length).toBeLessThanOrEqual(border)
    // The divider rows are mantle in the diff too, so the code rows are where the edge shows.
    for (const y of [rows.findIndex((row) => row.includes("greeting")), rows.indexOf(tailRow!)]) {
      expect(bgAt(spans, border - 1, y)).not.toEqual(ints(theme.mantle))
    }

    for (const row of rows) {
      const inside = row.slice(border)
      expect(inside).not.toContain("greeting")
      expect(inside).not.toContain(TAIL)
    }
  })

  test("without the panel the same line is drawn whole across the columns the panel takes", async () => {
    const width = 120
    const panelWidth = commentPanelWidth(width, false)
    const { frame } = await mountDocked(width, (host) => mainContentRow(host, null, { withTree: true }))
    const rows = await frame()
    const tailRow = rows.find((row) => row.includes(TAIL))!
    expect(tailRow.indexOf(TAIL)).toBeGreaterThan(width - panelWidth)
  })

  test("at 80 columns beside the tree the diff has no room left, and the panel gives up what it must to stay whole on screen", async () => {
    const width = 80
    const panelWidth = commentPanelWidth(width, false)
    const { setup, frame } = await mountDocked(width, (host, setup) => mainContentRow(host, panel(setup.renderer, panelWidth), { withTree: true }))
    const tree = new FileTreePanel({ renderer: setup.renderer, width: 35 })
    const row = setup.renderer.root.findDescendantById("main-content-row")!
    row.insertBefore(tree.getContainer(), row.getChildren()[0]!)
    disposers.unshift(() => tree.getContainer().destroyRecursively())
    const rows = await frame()
    expect(panelWidth).toBe(48)
    expect(rows[0]![0]).toBe("┌")
    expect(rows[0]![34]).toBe("┐")
    expectPanelShadeAt(setup.captureSpans(), [35, width - 1])
    expect(rows.join("\n")).not.toContain(TAIL)
  })
})

test("the error and an empty diff keep clear of the open panel, in a row the tree is not inserted into", async () => {
  const width = 100
  const panelWidth = commentPanelWidth(width, false)
  const mounted = await mountRenderable(
    (renderer) => mainContentRow(Text({ content: "x".repeat(width) }), panel(renderer, panelWidth), { withTree: false }),
    { width, height: 6 }
  )
  disposers.push(mounted.dispose)
  const rows = (await mounted.frame()).split("\n")
  expect(mounted.setup.renderer.root.findDescendantById("main-content-row")).toBeFalsy()
  const spans = mounted.setup.captureSpans()
  expectPanelShadeAt(spans, [width - panelWidth, width - 1])
  for (let y = 0; y < rows.length; y++) expect(bgAt(spans, width - panelWidth - 1, y)).not.toEqual(ints(theme.mantle))
  expect(rows[0]!.slice(0, width - panelWidth)).toBe("x".repeat(width - panelWidth))
})
