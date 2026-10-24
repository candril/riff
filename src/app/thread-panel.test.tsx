import { test, expect, afterEach, describe } from "bun:test"
import type { Renderable } from "@opentui/core"
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing"
import { createThreadPanelIsland } from "./thread-panel"
import type { ThreadPanelInput } from "../components/thread-panel-model"
import {
  closeInlineCommentOverlay,
  openInlineCommentOverlay,
  startInlineCompose,
  cancelInlineComposer,
  type AppState,
} from "../state"
import { mountApp } from "../testing/app-render"
import { columnWidths, DIFF_MIN_WIDTH } from "./column-widths"
import { composerTextareaIn } from "../testing/composer"
import { trimFrame } from "../testing/frame"
import type { Comment } from "../types"

const HEIGHT = 30

let teardown: (() => void | Promise<void>)[] = []
afterEach(async () => {
  for (const dispose of teardown) await dispose()
  teardown = []
})

function comment(id: string, line: number, fields: Partial<Comment> = {}): Comment {
  return {
    id,
    filename: "src/greet.ts",
    line,
    side: "RIGHT",
    body: `body of ${id}`,
    createdAt: "2026-01-10T10:00:00Z",
    status: "synced",
    author: "alice",
    ...fields,
  }
}

// A resolved thread (collapsed), an open one with a reply, and a lone comment.
const COMMENTS = [
  comment("r1", 2, { isThreadResolved: true, body: "Fixed in the next commit" }),
  comment("o1", 5, { body: "Why **bold** here?" }),
  comment("o2", 5, { inReplyTo: "o1", author: "bob", body: "Because it reads louder" }),
  comment("l1", 9, { body: "A `nit`" }),
]

function input(width: number, fields: Partial<ThreadPanelInput> = {}): ThreadPanelInput & { now: number } {
  return {
    comments: COMMENTS,
    scopeFilename: "src/greet.ts",
    composeFilename: "src/greet.ts",
    line: 3,
    replyToThread: false,
    note: false,
    mode: "view",
    appMode: "local",
    highlightedIndex: 0,
    editingId: null,
    draft: "",
    focused: true,
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
    openOnly: null,
    flashLabels: new Map(),
    now: Date.now(),
    ...fields,
  }
}

async function mountPanel(width: number) {
  const setup = await createTestRenderer({ width, height: HEIGHT })
  teardown.push(async () => {
    await setup.waitForVisualIdle().catch(() => {})
    setup.renderer.destroy()
  })
  const island = createThreadPanelIsland(setup.renderer)
  setup.renderer.root.add(island.host)
  return { setup, island }
}

async function draw(setup: TestRendererSetup) {
  await setup.renderOnce()
  await setup.renderOnce()
  return { frame: trimFrame(setup.captureCharFrame()), spans: JSON.stringify(setup.captureSpans()) }
}

async function pushed(width: number, pushes: (ThreadPanelInput & { now: number })[]) {
  const { setup, island } = await mountPanel(width)
  let last = { frame: "", spans: "" }
  for (const next of pushes) {
    island.update(next)
    last = await draw(setup)
  }
  return last
}

describe("a reused island draws what a fresh one does", () => {
  for (const width of [64, 40]) {
    const a = input(width)
    const moves: [string, ThreadPanelInput & { now: number }][] = [
      ["a j move", input(width, { highlightedIndex: 1 })],
      ["a fold with za", input(width, { highlightedIndex: 1, expandedThreadIds: new Set(["o1"]) })],
      ["an unfold of the resolved thread", input(width, { expandedThreadIds: new Set(["r1"]) })],
      ["a filter", input(width, { comments: COMMENTS.filter((c) => c.id.startsWith("o")), filter: "o" })],
      ["the filter being typed", input(width, { filterInput: true })],
    ]
    for (const [name, b] of moves) {
      test(`after ${name}, at ${width} columns`, async () => {
        const reused = await pushed(width, [a, b])
        const fresh = await pushed(width, [b])
        expect(reused.frame).toBe(fresh.frame)
        expect(reused.spans).toBe(fresh.spans)
      })
    }
  }
})

describe("the composer and its pickers", () => {
  test("come and go with the mode, and the hint row gives way while composing", async () => {
    const width = 64
    const { setup, island } = await mountPanel(width)
    const step = async (fields: Partial<ThreadPanelInput>) => {
      island.update(input(width, fields))
      return (await draw(setup)).frame
    }

    const view = await step({})
    expect(view).toContain("4 comments")
    expect(view).toContain("j/k nav")
    expect(view).not.toContain("New thread @")

    const composing = await step({ mode: "compose" })
    expect(composing).toContain("Composing")
    expect(composing).toContain("New comment @ greet.ts:3")
    expect(composing).not.toContain("j/k nav")
    expect(composing).not.toContain("@mention")

    const mention = await step({
      mode: "compose",
      mentionPicker: { query: "", selectedIndex: 0, atOffset: 0 },
      mentionCandidates: ["alice", "@you"],
    })
    expect(mention).toContain("@mention")
    expect(mention).toContain("▸ @alice")
    expect(mention).toContain("  @you")
    expect(mention).not.toContain("@@you")
    expect(mention).toContain("Tab/⏎ accept")

    const emoji = await step({ mode: "compose", emojiPicker: { query: "tada", selectedIndex: 0, colonOffset: 0 } })
    expect(emoji).toContain(":emoji")
    expect(emoji).toContain(":tada:")
    expect(emoji).not.toContain("@mention")

    const back = await step({})
    expect(back).toContain("j/k nav")
    for (const gone of ["Composing", "New comment @", ":emoji", "@mention", "Tab/⏎ accept"]) {
      expect(back).not.toContain(gone)
    }
    expect(back).toBe(view)
  })
})

describe("comment bodies", () => {
  const bodyOf = (setup: TestRendererSetup, id: string) =>
    setup.renderer.root.findDescendantById(`inline-overlay-body-${id}`)

  test("are built once per comment, kept across pushes and moves, and go with the comment", async () => {
    const { setup, island } = await mountPanel(64)
    island.update(input(64))
    await draw(setup)
    const body = bodyOf(setup, "o1")
    expect(body).toBeDefined()
    expect(body!.ctx).toBe(setup.renderer)

    island.update(input(64))
    await draw(setup)
    expect(bodyOf(setup, "o1")).toBe(body)

    island.update(input(64, { highlightedIndex: 2 }))
    const moved = await draw(setup)
    expect(bodyOf(setup, "o1")).toBe(body)
    expect(moved.frame).toContain("Why bold here?")

    island.update(input(64, { comments: COMMENTS.filter((c) => c.id !== "o1" && c.id !== "o2") }))
    const without = await draw(setup)
    expect(bodyOf(setup, "o1")).toBeUndefined()
    expect(without.frame).not.toContain("Why bold here?")
    expect(bodyOf(setup, "l1")).toBeDefined()
  })
})

const DIFF = `diff --git a/src/greet.ts b/src/greet.ts
index 1111111..2222222 100644
--- a/src/greet.ts
+++ b/src/greet.ts
@@ -1,3 +1,3 @@
 export function greet() {
-  return "hi"
+  return "hello"
 }
`

/** Every renderable under `root`, itself included. */
function countTree(root: Renderable): number {
  return 1 + root.getChildren().reduce((sum, child) => sum + countTree(child), 0)
}

describe("the panel in the app", () => {
  for (const width of [100, 80]) {
    test(`opening and closing twice leaves nothing behind, and the diff gives and takes the panel's columns on the first frame, at ${width} columns`, async () => {
      const app = await mountApp(DIFF, { width, height: 16 })
      teardown.push(() => app.dispose())
      const { renderer } = app.setup
      const diff = app.ctx.unified.island.host
      const panel = app.ctx.threadPanel.host
      app.show({ comments: COMMENTS, showFilePanel: true })
      await app.frame()
      expect(app.fileTreePanel.host.width).toBe(35)
      const closedWidth = diff.width
      const opened = () => openInlineCommentOverlay(app.ctx.getState(), "src/greet.ts", 2, "RIGHT", "view")

      const counts: number[] = []
      for (let round = 0; round < 2; round++) {
        app.show(opened())
        await app.setup.renderOnce()
        expect(panel.visible).toBe(true)
        const shared = columnWidths(width, { tree: { visible: true, expanded: false }, threads: { open: true, expanded: false }, chat: { open: false } })
        expect(panel.width).toBe(shared.threads)
        expect(panel.x).toBe(width - panel.width)
        expect(diff.width).toBe(shared.diff)
        expect(diff.width).toBeGreaterThanOrEqual(DIFF_MIN_WIDTH)
        await app.frame()
        counts.push(countTree(renderer.root))

        app.show(closeInlineCommentOverlay(app.ctx.getState()))
        await app.setup.renderOnce()
        expect(panel.visible).toBe(false)
        expect(diff.width).toBe(closedWidth)
        await app.frame()
        counts.push(countTree(renderer.root))
      }
      expect(counts[2]).toBe(counts[0])
      expect(counts[3]).toBe(counts[1])
    })
  }

  test("the composer it keeps mounted is seeded once per session, focused, and typed into; n on a draft resumes it", async () => {
    const app = await mountApp(DIFF, { width: 120, height: 24 })
    teardown.push(() => app.dispose())
    const { renderer, mockInput } = app.setup
    const textarea = composerTextareaIn(app.ctx.threadPanel.host)
    const at = (state: AppState) => openInlineCommentOverlay(state, "src/greet.ts", 2, "RIGHT", "view")

    app.show({ ...at(app.ctx.getState()), comments: COMMENTS })
    app.show(startInlineCompose(app.ctx.getState()))
    expect(renderer.currentFocusedRenderable).toBe(textarea)
    await mockInput.typeText("half a thought")
    app.render()
    expect(textarea.plainText).toBe("half a thought")
    expect(renderer.currentFocusedRenderable).toBe(textarea)
    expect(await app.frame()).toContain("half a thought")

    // A pass of the same session leaves what is typed alone.
    app.show({ inlineCommentOverlay: { ...app.ctx.getState().inlineCommentOverlay, input: "stale" } })
    expect(textarea.plainText).toBe("half a thought")

    // Esc keeps a draft; `n` brings it back into the same, still-mounted textarea.
    const { filename, line, side } = app.ctx.getState().inlineCommentOverlay
    app.commentDrafts.remember({ filename, line, side }, textarea.plainText)
    app.show(cancelInlineComposer(app.ctx.getState()))
    expect(renderer.currentFocusedRenderable).not.toBe(textarea)
    expect(await app.frame()).not.toContain("half a thought")
    textarea.setText("")
    app.show(startInlineCompose(app.ctx.getState(), app.commentDrafts.on({ filename, line, side })))
    expect(textarea.plainText).toBe("half a thought")
    expect(renderer.currentFocusedRenderable).toBe(textarea)
    expect(await app.frame()).toContain("half a thought")
    expect(textarea.parent).not.toBeNull()
  })
})

test("a panel hidden by a close shows the new model, not the last one, when it opens again", async () => {
  const { setup, island } = await mountPanel(64)
  island.update(input(64))
  await draw(setup)
  island.update(null)
  expect(island.host.visible).toBe(false)
  island.update(input(64, { comments: COMMENTS.slice(3) }))
  const { frame } = await draw(setup)
  expect(frame).toContain("1 comment")
  expect(frame).not.toContain("Fixed in the next commit")
})
