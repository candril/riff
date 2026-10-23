import { afterEach, expect, test } from "bun:test"
import { KeyEvent, parseKeypress } from "@opentui/core"
import { createInitialState, setThreadResolved } from "../state"
import { adoptReloadedState } from "../features/refresh/handlers"
import type { CommentsContext } from "../features/comments"
import type { Comment } from "../types"
import { mountApp, reloadCtx } from "../testing/app-render"
import { keysOn, moveTo } from "../testing/chat-keys"
import { COMPOSER_DIFF, send } from "../testing/composer-keys"

let app: Awaited<ReturnType<typeof mountApp>> | null = null
afterEach(async () => {
  await app?.dispose()
  app = null
})

// Only in the stored hunk, never in the diff, so it is on screen only while the peek is.
const PEEKED_CODE = "return 'what the reviewer saw'"

const COMMENTED: Comment = {
  id: "c1",
  filename: "src/greet.ts",
  line: 2,
  side: "RIGHT",
  body: "Why the change?",
  createdAt: "2026-01-01T00:00:00Z",
  status: "local",
  diffHunk: `@@ -1,3 +1,3 @@\n export function greet() {\n-  ${PEEKED_CODE}`,
}

/** riff on a commented line, its thread panel opened by Enter and focused, the peek not yet up. */
async function panelOnComment() {
  const mounted = await mountApp(COMPOSER_DIFF, { width: 120, height: 30 })
  app = mounted
  mounted.show({ comments: [COMMENTED] })
  const keys = keysOn(mounted, {
    getCommentScope: mounted.ctx.split.commentScope,
    commentsContext: { getCachedCurrentUser: () => null } as unknown as CommentsContext,
  })
  await mounted.frame()
  moveTo(mounted, keys.vimState, '  return "hello"')
  mounted.setup.mockInput.pressEnter()
  expect(mounted.ctx.getState().inlineCommentOverlay).toMatchObject({ open: true, mode: "view" })
  expect(mounted.ctx.getState().focusedPanel).toBe("comments")
  expect(await mounted.frame()).not.toContain(PEEKED_CODE)
  return { mounted, keys }
}

async function peek(mounted: NonNullable<typeof app>) {
  mounted.setup.mockInput.pressKey("c")
  expect(mounted.codePeek.id()).toBe("c1")
  expect(await mounted.frame()).toContain(PEEKED_CODE)
}

test("c on a comment with stored context shows its hunk over the panel, and Esc puts it away", async () => {
  const { mounted } = await panelOnComment()
  await peek(mounted)

  send(mounted, "\x1b")
  expect(mounted.codePeek.id()).toBeNull()
  expect(mounted.ctx.getState().inlineCommentOverlay.open).toBe(true)
  expect(await mounted.frame()).not.toContain(PEEKED_CODE)
})

test("resolving the peeked thread with open-only on closes the peek at the next pass", async () => {
  const { mounted } = await panelOnComment()
  await peek(mounted)

  // A key cannot resolve under the peek, which holds them; a poll can.
  mounted.ctx.setState((s) => setThreadResolved({ ...s, threadPanelOpenOnly: true }, "c1", true))
  mounted.render()

  expect(mounted.codePeek.id()).toBeNull()
  expect(await mounted.frame()).not.toContain(PEEKED_CODE)
})

test("closing the panel under the peek and opening it again shows no peek", async () => {
  const { mounted, keys } = await panelOnComment()
  await peek(mounted)

  // The peek holds the panel's keys, so the panel's close runs as its command.
  const escape = new KeyEvent(parseKeypress("\x1b")!)
  expect(keys.keymap.runCommand("threadPanel.toggle", { event: escape }).ok).toBe(true)
  expect(mounted.ctx.getState().inlineCommentOverlay.open).toBe(false)
  expect(mounted.codePeek.id()).toBeNull()

  mounted.setup.mockInput.pressEnter()
  expect(mounted.ctx.getState().inlineCommentOverlay.open).toBe(true)
  expect(mounted.codePeek.id()).toBeNull()
  expect(await mounted.frame()).not.toContain(PEEKED_CODE)
})

test("opening the panel afresh from the diff, with the peek still up, shows no peek", async () => {
  const { mounted } = await panelOnComment()
  await peek(mounted)

  // Focus back on the diff with the panel and its peek still up, as a click leaves it.
  mounted.ctx.setState((s) => ({ ...s, focusedPanel: "diff" }))
  mounted.setup.mockInput.pressEnter()

  expect(mounted.ctx.getState().inlineCommentOverlay.open).toBe(true)
  expect(mounted.codePeek.id()).toBeNull()
  expect(await mounted.frame()).not.toContain(PEEKED_CODE)
})

test("a reload closes the peek with the panel the rebuild closes", async () => {
  const { mounted } = await panelOnComment()
  await peek(mounted)

  adoptReloadedState(reloadCtx(mounted), (prev) => createInitialState(prev.files, prev.fileTree, prev.source, "reloaded"))

  expect(mounted.codePeek.id()).toBeNull()
  mounted.render()
  expect(await mounted.frame()).not.toContain(PEEKED_CODE)
})
