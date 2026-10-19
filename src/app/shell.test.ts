import { test, expect, afterEach, describe } from "bun:test"
import { BoxRenderable, TextRenderable, instantiate, type CliRenderer, type Renderable } from "@opentui/core"
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing"
import { createFileTreeIsland, type FileTreeIsland } from "./file-tree"
import { InlineCommentOverlay } from "../components/InlineCommentOverlay"
import { commentPanelWidth } from "../features/inline-comment-overlay"
import { bgAt, ints } from "../testing/frame"
import { mountIsland } from "../testing/unified-island"
import { theme } from "../theme"
import { keepAlive } from "../utils/renderables"
import { createAppShell, OVERLAYS, type ShellParts } from "./shell"
import { createConfirmDialogIsland } from "./confirm-dialog"
import { confirmDialogModel } from "../components/confirm-dialog-model"

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

/** The shell with every host an empty box, so the content row has the whole screen. */
function bareShell(
  renderer: CliRenderer,
  tree: Renderable = new BoxRenderable(renderer, {}),
  real: Partial<ShellParts["overlays"]> = {}
) {
  const box = (id: string) => keepAlive(new BoxRenderable(renderer, { id }))
  const overlays = {} as ShellParts["overlays"]
  for (const id of OVERLAYS) overlays[id] = real[id] ?? box(id)
  return createAppShell(renderer, {
    header: box("header"),
    tree,
    searchPrompt: box("searchPrompt"),
    statusBar: box("statusBar"),
    flashPrompt: box("flashPrompt"),
    overlays,
  })
}

function panel(renderer: CliRenderer, width: number) {
  return instantiate(renderer, InlineCommentOverlay({
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
  }))
}

type Spans = ReturnType<TestRendererSetup["captureSpans"]>

/** Every row of `columns` is drawn on the panel's mantle. */
function expectPanelShadeAt(spans: Spans, columns: number[]) {
  for (let y = 0; y < spans.lines.length; y++) {
    for (const x of columns) expect(bgAt(spans, x, y)).toEqual(ints(theme.mantle))
  }
}

async function mountDocked(width: number, { withPanel, tree }: { withPanel: boolean; tree?: (renderer: CliRenderer) => Renderable }) {
  const mounted = await mountIsland({ raw: DIFF, width, height: 12, wrap: true })
  disposers.push(mounted.dispose)
  const renderer = mounted.setup.renderer
  const shell = bareShell(renderer, tree?.(renderer))
  shell.setView(mounted.island.host, { withTree: true })
  const threadPanel = withPanel ? panel(renderer, commentPanelWidth(width, false)) : null
  shell.setThreadPanel(threadPanel)
  return { ...mounted, threadPanel }
}

describe("the thread panel docked in the content row", () => {
  test("narrows the diff beside it, which wraps its lines clear of the panel", async () => {
    const width = 120
    const panelWidth = commentPanelWidth(width, false)
    const { setup, frame } = await mountDocked(width, { withPanel: true })
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
    const { frame } = await mountDocked(width, { withPanel: false })
    const rows = await frame()
    const tailRow = rows.find((row) => row.includes(TAIL))!
    expect(tailRow.indexOf(TAIL)).toBeGreaterThan(width - panelWidth)
  })

  test("at 80 columns beside the tree the diff has no room left, and the panel gives up what it must to stay whole on screen", async () => {
    const width = 80
    const panelWidth = commentPanelWidth(width, false)
    let tree: FileTreeIsland | null = null
    const { setup, frame, threadPanel } = await mountDocked(width, {
      withPanel: true,
      tree: (renderer) => (tree = createFileTreeIsland(renderer, { width: 35 })).host,
    })
    disposers.unshift(() => tree!.dispose())
    const rows = await frame()
    expect(panelWidth).toBe(48)
    expect(rows[0]!.slice(2, 7)).toBe("Files")
    const treeLastColumn = tree!.host.x + tree!.host.width - 1
    expect(treeLastColumn).toBe(34)
    expect(threadPanel!.x).toBe(treeLastColumn + 1)
    expect(threadPanel!.width).toBe(width - 35)
    expectPanelShadeAt(setup.captureSpans(), [0, 34, 35, width - 1])
    expect(rows.join("\n")).not.toContain(TAIL)
  })

  for (const [width, panelWidth] of [[80, 48], [70, 48], [60, 40]] as const) {
    test(`at ${width} columns a ${panelWidth}-column panel starts where the tree ends and never covers it`, async () => {
      const setup = await createTestRenderer({ width, height: 8 })
      disposers.push(() => setup.renderer.destroy())
      const renderer = setup.renderer
      const tree = createFileTreeIsland(renderer, { width: 35 })
      disposers.unshift(() => tree.dispose())
      const shell = bareShell(renderer, tree.host)
      shell.setView(keepAlive(new TextRenderable(renderer, { content: "x" })), { withTree: true })
      const threadPanel = panel(renderer, panelWidth)
      shell.setThreadPanel(threadPanel)
      await setup.renderOnce()
      await setup.renderOnce()
      expect(tree.host.width).toBe(35)
      expect(threadPanel.x).toBe(35)
      expect(threadPanel.width).toBe(width - 35)
    })
  }
})

test("the error and an empty diff keep clear of the open panel, with the tree hidden", async () => {
  const width = 100
  const panelWidth = commentPanelWidth(width, false)
  const height = 6
  const setup = await createTestRenderer({ width, height })
  disposers.push(() => setup.renderer.destroy())
  const renderer = setup.renderer
  const tree = createFileTreeIsland(renderer, { width: 35 })
  const shell = bareShell(renderer, tree.host)
  shell.setView(keepAlive(new TextRenderable(renderer, { content: "x".repeat(width) })), { withTree: false })
  shell.setThreadPanel(panel(renderer, panelWidth))
  await setup.renderOnce()
  await setup.renderOnce()
  const captured = setup.captureCharFrame().split("\n")
  // The last row ends in a newline too, which the split leaves as an empty entry after it.
  const afterLastRow = captured.at(-1)
  const rows = captured.slice(0, -1)
  expect(afterLastRow).toBe("")
  expect(rows).toHaveLength(height)
  const spans = setup.captureSpans()
  expectPanelShadeAt(spans, [width - panelWidth, width - 1])
  for (let y = 0; y < rows.length; y++) expect(bgAt(spans, width - panelWidth - 1, y)).not.toEqual(ints(theme.mantle))
  expect(rows[0]!.slice(0, width - panelWidth)).toBe("x".repeat(width - panelWidth))
  // The tree keeps its own toggle: hiding it for the view is the slot's doing.
  expect(tree.visible).toBe(true)
})

test("a hidden overlay host over the whole screen takes neither the clicks nor the wheel meant for what is under it", async () => {
  const setup = await createTestRenderer({ width: 60, height: 16 })
  disposers.push(() => setup.renderer.destroy())
  const renderer = setup.renderer
  // Absolute, full-size and with its backdrop drawn: the host that would swallow most.
  const dialog = createConfirmDialogIsland(renderer)
  dialog.update(confirmDialogModel({ title: "Clear?", message: "Gone.", onConfirm() {}, onCancel() {} }))
  const shell = bareShell(renderer, undefined, { confirmDialog: dialog.host })
  const view = keepAlive(new BoxRenderable(renderer, { width: "100%", height: "100%" }))
  shell.setView(view, { withTree: false })
  let hits = 0
  view.onMouseDown = () => hits++
  view.onMouseScroll = () => hits++
  await setup.renderOnce()

  await setup.mockMouse.click(5, 5)
  await setup.mockMouse.scroll(5, 5, "down")
  expect(hits).toBe(2)

  shell.show("confirmDialog", true)
  await setup.renderOnce()
  await setup.mockMouse.click(5, 5)
  await setup.mockMouse.scroll(5, 5, "down")
  expect(hits).toBe(2)
})

test("flash and the status bar share one row, exactly one of them shown", async () => {
  const setup = await createTestRenderer({ width: 20, height: 4 })
  disposers.push(() => setup.renderer.destroy())
  const shell = bareShell(setup.renderer)
  const host = (id: string) => shell.root.getChildren().find((child) => child.id === id)!
  expect([host("statusBar").visible, host("flashPrompt").visible]).toEqual([true, false])
  shell.showFlash(true)
  expect([host("statusBar").visible, host("flashPrompt").visible]).toEqual([false, true])
  shell.showFlash(false)
  expect([host("statusBar").visible, host("flashPrompt").visible]).toEqual([true, false])
})

test("the hosts are stacked header first and the overlays in their fixed order, the last drawn on top", async () => {
  const setup = await createTestRenderer({ width: 20, height: 4 })
  disposers.push(() => setup.renderer.destroy())
  const shell = bareShell(setup.renderer)
  expect(setup.renderer.root.getChildren()).toEqual([shell.root])
  const [header, content, ...rest] = shell.root.getChildren()
  // The content box holds the row: the tree's slot and the view's, the thread panel joining them while open.
  expect(content!.getChildren()[0]!.getChildren()).toHaveLength(2)
  expect([header!.id, ...rest.map((child) => child.id)]).toEqual([
    "header",
    "searchPrompt",
    "statusBar",
    "flashPrompt",
    "actionMenu",
    "toast",
    "reviewPreview",
    "syncPreview",
    "filePicker",
    "commentsPicker",
    "marksPicker",
    "occurrencePicker",
    "commitPicker",
    "helpOverlay",
    "diffPeek",
    "hunkPeek",
    "confirmDialog",
    "draftNotification",
  ])
})
