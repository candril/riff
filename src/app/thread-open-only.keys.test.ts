import { afterEach, describe, expect, test } from "bun:test"
import type { AppKeyContext } from "./key-context"
import { createAppKeys } from "./keys"
import { mountApp } from "../testing/app-render"
import { failOnKeymapErrors } from "../testing/keymap-errors"
import { createFlashState } from "../vim-diff/flash-state"
import { createSearchState } from "../vim-diff/search-state"
import { getInlineCommentOverlayDisplayOrder, startInlineCompose, toggleThreadPanelOpenOnly } from "../state"
import type { Comment } from "../types"

const FILE = `diff --git a/src/greet.ts b/src/greet.ts
new file mode 100644
index 0000000..2222222
--- /dev/null
+++ b/src/greet.ts
@@ -0,0 +1,10 @@
${Array.from({ length: 10 }, (_, i) => `+export const line${i + 1} = ${i + 1}`).join("\n")}
`

function comment(id: string, line: number, body: string, fields: Partial<Comment> = {}): Comment {
  return {
    id,
    filename: "src/greet.ts",
    line,
    side: "RIGHT",
    body,
    createdAt: "2026-01-01T00:00:00Z",
    status: "synced",
    author: "ana",
    ...fields,
  }
}

const THREADS: Comment[] = [
  comment("o1", 1, "open question one"),
  comment("o1r", 1, "an answer to one", { inReplyTo: "o1", author: "bo" }),
  comment("r1", 3, "settled long ago", { isThreadResolved: true }),
  comment("d1", 5, "about code since moved", { outdated: true }),
  comment("o2", 7, "open question two"),
]

let app: Awaited<ReturnType<typeof mountApp>> | null = null
afterEach(async () => {
  await app?.dispose()
  app = null
})

/**
 * riff's key handler on the app's render pass. The toggle stands in for
 * app.ts's without the save, so nothing here writes into the repo's
 * `.riff`; anything else it reaches throws.
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
    activityFeed: mounted.activityFeed,
    confirm: mounted.confirm,
    syncPreview: mounted.syncPreview,
    reviewPreview: mounted.reviewPreview,
    filePicker: mounted.filePicker,
    commentsPicker: mounted.commentsPicker,
    occurrencePicker: mounted.occurrencePicker,
    marksPicker: mounted.marksPicker,
    commitPicker: mounted.commitPicker,
    actionMenu: mounted.actionMenu,
    prCommentInput: mounted.prCommentInput,
    chat: { state: mounted.chat, column: mounted.chatColumnState, input: mounted.chatColumn.input, atPicker: mounted.chatColumn.atPicker },
    prInfoFilter: mounted.prInfoFilter,
    linePeek: mounted.linePeek,
    blamePeek: mounted.blamePeek,
    composerPickers: mounted.composerPickers,
    codePeek: mounted.codePeek,
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
    composer: render.threadPanel.composer,
    getCommentScope: render.split.commentScope,
    toggleOpenThreadsOnly: () => {
      render.setState(toggleThreadPanelOpenOnly)
      mounted.render()
    },
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
      fileFolds: mounted.fileFolds,
      createLineMapping: () => {},
    } as unknown as AppKeyContext["fileNavContext"],
    commentsContext: { getCachedCurrentUser: () => null } as unknown as AppKeyContext["commentsContext"],
  }
  known.threadMotionContext = {
    getState: render.getState,
    setState: render.setState,
    getVimState: () => vimState,
    setVimState,
    getLineMapping: render.getLineMapping,
    ensureCursorVisible: () => {},
    render: mounted.render,
    fileNavContext: known.fileNavContext!,
    visit: mounted.visit,
    composerPickers: mounted.composerPickers,
    codePeek: mounted.codePeek,
  }
  const ctx = new Proxy(known, {
    get(target, name) {
      if (name in target) return target[name as keyof AppKeyContext]
      return () => {
        throw new Error(`the open-only toggle reached ctx.${String(name)}`)
      }
    },
  }) as AppKeyContext
  mounted.setup.renderer.keyInput.on("keypress", failOnKeymapErrors(createAppKeys(mounted.setup.renderer, ctx)))
}

async function panelApp(width: number) {
  app = await mountApp(FILE, { width, height: 30 })
  app.show({ comments: THREADS, selectedFileIndex: 0 })
  keysOn(app)
  await app.frame()
  app.setup.mockInput.pressKey("t", { ctrl: true })
  app.show({ focusedPanel: "comments" })
  expect(app.ctx.getState().inlineCommentOverlay.open).toBe(true)
  return app
}

const order = () => getInlineCommentOverlayDisplayOrder(app!.ctx.getState()).map((c) => c.id)
const highlightedId = () => order()[app!.ctx.getState().inlineCommentOverlay.highlightedIndex]

describe("H in the thread panel", () => {
  test("shows only open threads, says how many it hides, and H again draws the panel as it was", async () => {
    const mounted = await panelApp(140)
    const before = await mounted.frame()
    expect(before).toContain("about code since moved")
    expect(before).not.toContain("open only")

    await mounted.setup.mockInput.typeText("H")
    expect(mounted.ctx.getState().threadPanelOpenOnly).toBe(true)
    const filtered = await mounted.frame()
    expect(filtered).toContain("open only · 2 hidden")
    expect(filtered).toContain("open question one")
    expect(filtered).toContain("an answer to one")
    expect(filtered).toContain("open question two")
    expect(filtered).not.toContain("about code since moved")
    // The resolved thread is drawn as a collapsed header row on its line; neither it nor the outdated one is.
    expect(before).toContain("─ line 3")
    expect(filtered).not.toContain("─ line 3")
    expect(filtered).not.toContain("─ line 5")
    expect(filtered).toContain("3 comments")

    await mounted.setup.mockInput.typeText("H")
    expect(mounted.ctx.getState().threadPanelOpenOnly).toBe(false)
    expect(await mounted.frame()).toBe(before)
  })

  test("j and G move among the open threads only", async () => {
    const mounted = await panelApp(140)
    await mounted.setup.mockInput.typeText("H")
    expect(order()).toEqual(["o1", "o1r", "o2"])

    await mounted.setup.mockInput.typeText("j")
    expect(highlightedId()).toBe("o1r")
    await mounted.setup.mockInput.typeText("j")
    expect(highlightedId()).toBe("o2")
    await mounted.setup.mockInput.typeText("j")
    expect(highlightedId()).toBe("o2")
    await mounted.setup.mockInput.typeText("gg")
    expect(highlightedId()).toBe("o1")
    await mounted.setup.mockInput.typeText("G")
    expect(highlightedId()).toBe("o2")
  })

  // 88 is the narrowest screen that leaves the 48-column panel whole beside the diff's floor.
  test("at the panel's narrowest, on an 88-column screen, the note gives way and the count stays whole", async () => {
    const mounted = await panelApp(88)
    await mounted.setup.mockInput.typeText("H")
    const header = async () => {
      const lines = (await mounted.frame()).split("\n")
      return lines.find((line) => line.includes("greet.ts  ") && line.includes("comments"))!
    }
    expect(await header()).toContain("open only · 2 hidden")
    expect((await header()).trimEnd().endsWith("3 comments")).toBe(true)

    // An accepted `/` filter widens the label until the note no longer fits.
    const s = mounted.ctx.getState()
    mounted.show({ inlineCommentOverlay: { ...s.inlineCommentOverlay, filter: "src/greet" } })
    const narrow = await header()
    expect(narrow).toContain("greet.ts  /src/greet  open only")
    expect(narrow).not.toContain("2 hidden")
    expect(narrow.trimEnd().endsWith("3 comments")).toBe(true)
  })

  test("while composing, H is a letter in the comment and leaves the toggle alone", async () => {
    const mounted = await panelApp(140)
    mounted.show(startInlineCompose(mounted.ctx.getState()))
    await mounted.frame()

    await mounted.setup.mockInput.typeText("H")
    await mounted.frame()
    expect(mounted.ctx.getState().threadPanelOpenOnly).toBe(false)
    expect(mounted.ctx.threadPanel.composer.value()).toBe("H")
  })
})

describe("Ctrl-n and K in the thread panel", () => {
  const cursorLine = () => {
    const { ctx } = app!
    return ctx.getLineMapping().getLine(ctx.getVimState().line)?.newLineNum
  }
  const ctrl = (key: string) => app!.setup.mockInput.pressKey(key, { ctrl: true })
  // Ctrl-t opens the panel on the file's header row, ahead of every thread.
  const onFirstThread = () => {
    ctrl("n")
    expect(app!.ctx.getState().inlineCommentOverlay.line).toBe(1)
    expect(highlightedId()).toBe("o1")
  }

  test("with open-only on, pass over the resolved and the outdated thread", async () => {
    const mounted = await panelApp(140)
    await mounted.setup.mockInput.typeText("H")
    onFirstThread()

    ctrl("n")
    expect(mounted.ctx.getState().inlineCommentOverlay.line).toBe(7)
    expect(highlightedId()).toBe("o2")
    expect(cursorLine()).toBe(7)
    const frame = await mounted.frame()
    expect(frame).toContain("open question two")
    expect(frame).not.toContain("settled long ago")
    expect(frame).not.toContain("about code since moved")
    expect(frame).toContain("▸ @ana Jan 1 [synced]")

    // Ctrl-p is the action menu's; K is the previous thread.
    await mounted.setup.mockInput.typeText("K")
    expect(mounted.ctx.getState().inlineCommentOverlay.line).toBe(1)
    expect(highlightedId()).toBe("o1")
    expect(cursorLine()).toBe(1)
  })

  test("with open-only off, Ctrl-n lands on the resolved thread next", async () => {
    const mounted = await panelApp(140)
    onFirstThread()
    ctrl("n")
    expect(mounted.ctx.getState().inlineCommentOverlay.line).toBe(3)
    expect(highlightedId()).toBe("r1")
    expect(cursorLine()).toBe(3)
  })
})

// No key leaves a composer picker standing outside the composer, so each
// case sets one just before its key to show that key clearing it.
describe("Opening the thread panel or moving it to another thread", () => {
  const pickers = () => [app!.composerPickers.mention(), app!.composerPickers.emoji()]
  const standingPicker = () => app!.composerPickers.setEmoji({ query: "smil", colonOffset: 3 })

  test("Ctrl-t on the file's header row opens the panel with no picker and no code peek", async () => {
    app = await mountApp(FILE, { width: 140, height: 30 })
    app.show({ comments: THREADS, selectedFileIndex: 0 })
    keysOn(app)
    await app.frame()
    standingPicker()
    // Nor does any key leave a code peek standing outside the panel.
    app.codePeek.open("o1")
    app.setup.mockInput.pressKey("t", { ctrl: true })
    expect(app.ctx.getState().inlineCommentOverlay).toMatchObject({ open: true, mode: "view", line: 0 })
    expect(pickers()).toEqual([null, null])
    expect(app.codePeek.id()).toBeNull()
  })

  test("Ctrl-n moves the panel to the next thread with no picker", async () => {
    const mounted = await panelApp(140)
    standingPicker()
    mounted.setup.mockInput.pressKey("n", { ctrl: true })
    expect(mounted.ctx.getState().inlineCommentOverlay.line).toBe(1)
    expect(pickers()).toEqual([null, null])
  })
})
