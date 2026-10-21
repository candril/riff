import { afterEach, describe, expect, test } from "bun:test"
import type { GlobalKeyContext } from "./global-keys"
import { createAppKeys } from "./keys"
import { mountApp } from "../testing/app-render"
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
  const known: Partial<GlobalKeyContext> = {
    getState: render.getState,
    setState: render.setState,
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
    } as unknown as GlobalKeyContext["foldsContext"],
    fileNavContext: {
      getState: render.getState,
      setState: render.setState,
      createLineMapping: () => {},
    } as unknown as GlobalKeyContext["fileNavContext"],
    commentsContext: { source: "test", getCachedCurrentUser: () => null } as unknown as GlobalKeyContext["commentsContext"],
  }
  const ctx = new Proxy(known, {
    get(target, name) {
      if (name in target) return target[name as keyof GlobalKeyContext]
      return () => {
        throw new Error(`the open-only toggle reached ctx.${String(name)}`)
      }
    },
  }) as GlobalKeyContext
  mounted.setup.renderer.keyInput.on("keypress", createAppKeys(mounted.setup.renderer, ctx))
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

  test("at the panel's narrowest, on an 80-column screen, the note gives way and the count stays whole", async () => {
    const mounted = await panelApp(80)
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
