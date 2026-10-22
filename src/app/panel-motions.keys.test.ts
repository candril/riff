import { afterEach, describe, expect, test } from "bun:test"
import type { AppKeyContext } from "./key-context"
import { createAppKeys } from "./keys"
import { mountApp } from "../testing/app-render"
import { createFlashState } from "../vim-diff/flash-state"
import { createSearchState } from "../vim-diff/search-state"
import { treeRowsOf } from "../components"
import { getInlineCommentOverlayDisplayOrder, openInlineCommentOverlay, startTreeFilter, type AppState } from "../state"
import type { Comment } from "../types"
import { halfPage } from "../utils/half-page"
import { bgAt, ints } from "../testing/frame"
import { theme } from "../theme"

const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

const fileDiff = (i: number) => {
  const name = `src/f${String(i).padStart(2, "0")}.ts`
  return `diff --git a/${name} b/${name}
index 1111111..2222222 100644
--- a/${name}
+++ b/${name}
@@ -1,2 +1,2 @@
 export const keep${i} = 0
-export const old${i} = 1
+export const new${i} = 1
`
}

const FORTY_FILES = Array.from({ length: 40 }, (_, i) => fileDiff(i)).join("")

const LONG_LINES = 60
const LONG_FILE = `diff --git a/src/long.ts b/src/long.ts
new file mode 100644
index 0000000..2222222
--- /dev/null
+++ b/src/long.ts
@@ -0,0 +1,${LONG_LINES} @@
${Array.from({ length: LONG_LINES }, (_, i) => `+export const line${i + 1} = ${i + 1}`).join("\n")}
`

/** A thread on every other line, every fifth from the second long enough to take several rows. */
const THREADS: Comment[] = Array.from({ length: 30 }, (_, i) => ({
  id: `c${i}`,
  filename: "src/long.ts",
  line: 2 * i + 1,
  side: "RIGHT",
  body: i % 5 === 1 ? Array.from({ length: 12 }, (_, n) => `paragraph ${n} of thread ${i}`).join("\n\n") : `thread ${i}`,
  createdAt: "2026-01-01T00:00:00Z",
  status: "synced",
  author: "ana",
}))

let app: Awaited<ReturnType<typeof mountApp>> | null = null
afterEach(async () => {
  await app?.dispose()
  app = null
})

/**
 * riff's key handler on the app's render pass, wired for the tree, the
 * thread panel and the diff cursor they move. Anything else it calls
 * throws, so a key that leaks into another handler shows up here.
 */
function keysOn(mounted: NonNullable<typeof app>) {
  const { ctx: render } = mounted
  let vimState = render.getVimState()
  const setVimState = (next: typeof vimState) => {
    vimState = next
    mounted.setVimState(next)
  }
  const known: Partial<AppKeyContext> = {
    getState: render.getState,
    setState: render.setState,
    help: mounted.help,
    confirm: mounted.confirm,
    syncPreview: mounted.syncPreview,
    reviewPreview: mounted.reviewPreview,
    filePicker: mounted.filePicker,
    commentsPicker: mounted.commentsPicker,
    getVimState: () => vimState,
    setVimState,
    getLineMapping: render.getLineMapping,
    getFlashState: () => createFlashState(),
    getSearchState: () => createSearchState(),
    renderer: mounted.setup.renderer,
    render: mounted.render,
    ensureCursorVisible: () => {},
    fileTreePanel: mounted.fileTreePanel,
    updateFileTreePanel: render.updateFileTreePanel,
    threadPanelLayout: () => render.threadPanel.layout(),
    foldsContext: {
      getState: render.getState,
      setState: render.setState,
      getVimState: () => vimState,
      setVimState,
      getFileTreePanel: () => mounted.fileTreePanel,
      updateFileTreePanel: render.updateFileTreePanel,
      render: mounted.render,
    } as unknown as AppKeyContext["foldsContext"],
    fileNavContext: {
      getState: render.getState,
      setState: render.setState,
      createLineMapping: () => {},
    } as unknown as AppKeyContext["fileNavContext"],
  }
  const ctx = new Proxy(known, {
    get(target, name) {
      if (name in target) return target[name as keyof AppKeyContext]
      return () => {
        throw new Error(`a panel motion reached ctx.${String(name)}`)
      }
    },
  }) as AppKeyContext
  mounted.setup.renderer.keyInput.on("keypress", createAppKeys(mounted.setup.renderer, ctx))
  return { vimLine: () => vimState.line }
}

const ctrl = (mounted: NonNullable<typeof app>, name: string) => mounted.setup.mockInput.pressKey(name, { ctrl: true })

describe("the file tree", () => {
  async function treeApp() {
    app = await mountApp(FORTY_FILES, { width: 100, height: 24 })
    app.show({ focusedPanel: "tree" })
    app.ctx.updateFileTreePanel()
    const keys = keysOn(app)
    await app.frame()
    const s = app.ctx.getState()
    const rows = treeRowsOf(s)
    return { ...keys, rows, mounted: app }
  }

  const highlight = () => app!.ctx.getState().treeHighlightIndex
  /** The tree's column of the frame, and the one row of it drawn on the selection's surface0. */
  async function treeFrame(mounted: NonNullable<typeof app>) {
    const lines = (await mounted.frame()).split("\n").map((line) => line.slice(0, 35))
    const spans = mounted.setup.captureSpans()
    const selected = lines.flatMap((_, y) => (equal(bgAt(spans, 2, y), ints(theme.surface0)) ? [y] : []))
    expect(selected).toHaveLength(1)
    return { lines, selected: lines[selected[0]!]!, selectedAt: selected[0]! }
  }

  test("Ctrl-d moves half the tree's viewport down and Ctrl-u comes back, the row on screen and the diff cursor still", async () => {
    const { mounted, vimLine, rows } = await treeApp()
    const step = halfPage(mounted.fileTreePanel.viewportRows())
    expect(step).toBeGreaterThan(1)
    expect(rows.length).toBeGreaterThan(2 * step + 2)
    const line = vimLine()

    ctrl(mounted, "d")
    expect(highlight()).toBe(step)
    ctrl(mounted, "d")
    expect(highlight()).toBe(2 * step)
    expect((await treeFrame(mounted)).selected).toContain(rows[2 * step]!.node.name)

    ctrl(mounted, "u")
    expect(highlight()).toBe(step)
    ctrl(mounted, "u")
    ctrl(mounted, "u")
    expect(highlight()).toBe(0)
    expect(vimLine()).toBe(line)
  })

  test("a lone G goes to the last entry and gg back to the first, each drawn at its edge with the hint on the other side", async () => {
    const { mounted, vimLine, rows } = await treeApp()
    const line = vimLine()

    await mounted.setup.mockInput.typeText("G")
    expect(highlight()).toBe(rows.length - 1)
    const bottom = await treeFrame(mounted)
    // The last tree row sits on the screen's bottom row, and the rows above it are counted at the top.
    expect(bottom.selected).toContain(rows[rows.length - 1]!.node.name)
    expect(bottom.selectedAt).toBe(bottom.lines.length - 1)
    expect(bottom.lines[2]).toContain("↑")
    expect(bottom.lines.join("\n")).not.toContain("↓")

    await mounted.setup.mockInput.typeText("gg")
    expect(highlight()).toBe(0)
    const top = await treeFrame(mounted)
    expect(top.selected).toContain("src")
    expect(top.selectedAt).toBe(2)
    expect(top.lines[top.lines.length - 1]).toContain("↓")
    expect(top.lines.join("\n")).not.toContain("↑")
    expect(vimLine()).toBe(line)
  })

  test("with the filter prompt open, Ctrl-d belongs to the prompt and the highlight stays", async () => {
    const { mounted } = await treeApp()
    mounted.show(startTreeFilter(mounted.ctx.getState()))
    mounted.ctx.updateFileTreePanel()
    ctrl(mounted, "d")
    expect(highlight()).toBe(0)
    expect(mounted.ctx.getState().treeFilterInput).toBe(true)
  })
})

describe("the thread panel", () => {
  async function panelApp() {
    app = await mountApp(LONG_FILE, { width: 140, height: 40 })
    app.show({ comments: THREADS })
    app.show({
      ...openInlineCommentOverlay(app.ctx.getState(), "src/long.ts", 1, "RIGHT", "view"),
      focusedPanel: "comments",
    })
    const keys = keysOn(app)
    await app.frame()
    return { ...keys, mounted: app }
  }

  const order = (s: AppState) => getInlineCommentOverlayDisplayOrder(s)
  const highlighted = () => app!.ctx.getState().inlineCommentOverlay.highlightedIndex
  /** Where the diff cursor goes for the highlighted comment, as j/k put it there. */
  const lineFor = (index: number) => app!.ctx.getLineMapping().findLineForComment(order(app!.ctx.getState())[index]!)

  /**
   * The entry holding the row half the panel's rows below the highlighted
   * entry's top, read off the panel as last drawn.
   */
  function entryHalfAPageDown(mounted: NonNullable<typeof app>): number {
    const layout = mounted.ctx.threadPanel.layout()!
    const tops = order(mounted.ctx.getState()).map((c) => layout.tops.get(c.id)!)
    const from = highlighted()
    const target = tops[from]! + halfPage(layout.viewportRows)
    return Math.max(from + 1, tops.findLastIndex((top) => top <= target))
  }

  test("Ctrl-d and Ctrl-u move by half the panel's rows, passing fewer threads where one is long, and the diff cursor follows", async () => {
    const { mounted, vimLine } = await panelApp()
    expect(halfPage(mounted.ctx.threadPanel.layout()!.viewportRows)).toBeGreaterThan(12)

    const moves: number[] = []
    for (let press = 0; press < 4; press++) {
      const from = highlighted()
      const expected = entryHalfAPageDown(mounted)
      ctrl(mounted, "d")
      expect(highlighted()).toBe(expected)
      expect(vimLine()).toBe(lineFor(expected)!)
      moves.push(expected - from)
      const lines = (await mounted.frame()).split("\n")
      const caret = lines.findIndex((line) => line.includes("▸ @ana"))
      expect(lines[caret + 1]).toContain(` thread ${expected}`)
    }
    // Two short threads fit in half a page; a long one is a page's half on its own.
    expect(new Set(moves)).toEqual(new Set([1, 2]))

    // Going up, the threads above the window are not drawn yet, so where
    // the step lands is checked against the panel once it has drawn them.
    while (highlighted() > 0) {
      const from = highlighted()
      ctrl(mounted, "u")
      const to = highlighted()
      expect(to).toBeLessThan(from)
      await mounted.frame()
      const layout = mounted.ctx.threadPanel.layout()!
      const top = (index: number) => layout.tops.get(order(mounted.ctx.getState())[index]!.id)!
      const step = halfPage(layout.viewportRows)
      if (to > 0) expect(top(from) - top(to)).toBeGreaterThanOrEqual(step)
      if (to + 1 < from) expect(top(from) - top(to + 1)).toBeLessThan(step)
      expect(vimLine()).toBe(lineFor(to)!)
    }
    ctrl(mounted, "u")
    expect(highlighted()).toBe(0)
  })

  test("gg and G go to the first and last entry, and G never takes the diff cursor to the end of the diff", async () => {
    const { mounted, vimLine } = await panelApp()
    const last = order(mounted.ctx.getState()).length - 1
    const diffEnd = mounted.ctx.getLineMapping().lineCount - 1

    await mounted.setup.mockInput.typeText("G")
    expect(highlighted()).toBe(last)
    expect(vimLine()).toBe(lineFor(last)!)
    expect(vimLine()).not.toBe(diffEnd)
    expect(await mounted.frame()).toContain(`thread ${last}`)

    await mounted.setup.mockInput.typeText("gg")
    expect(highlighted()).toBe(0)
    expect(vimLine()).toBe(lineFor(0)!)
    expect(mounted.ctx.getState().inlineCommentOverlay.open).toBe(true)
  })
})
