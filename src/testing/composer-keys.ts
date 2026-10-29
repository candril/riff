import { expect, spyOn } from "bun:test"
import { KeyEvent, parseKeypress } from "@opentui/core"
import * as storage from "../storage/comments"
import * as commentsFeature from "../features/comments"
import * as spawn from "../utils/editor/spawn"
import type { CommentsContext } from "../features/comments"
import type { ExternalToolsContext } from "../features/external-tools"
import type { ComposerOutcome } from "../features/inline-comment-overlay/composer-keys"
import type { AppState } from "../state"
import { mountApp } from "./app-render"
import { keysOn, moveTo } from "./chat-keys"
import { composerTextareaIn } from "./composer"

export const COMPOSER_DIFF = `diff --git a/src/greet.ts b/src/greet.ts
index 1111111..2222222 100644
--- a/src/greet.ts
+++ b/src/greet.ts
@@ -1,3 +1,3 @@
 export function greet() {
-  return "hi"
+  return "hello"
 }
`

type Mounted = Awaited<ReturnType<typeof mountApp>>

/**
 * riff with the composer opened by `c` on the changed line, its comment
 * saved nowhere, its post to GitHub and its $EDITOR stubbed. Undo the
 * spies with `mock.restore()` and dispose `app` after each test.
 */
export async function composing(patch: Partial<AppState> = {}, size = { width: 120, height: 24 }) {
  const app = await mountApp(COMPOSER_DIFF, size)
  app.show(patch)
  // Saving writes the comment under .riff/; a test has no business there.
  spyOn(storage, "saveComment").mockResolvedValue()
  const submitted = spyOn(commentsFeature, "handleSubmitSingleComment").mockResolvedValue()
  const editor = spyOn(spawn, "openTextInEditor").mockResolvedValue("from the editor")
  const settled: ComposerOutcome[] = []
  const suspended: string[] = []
  const keys = keysOn(app, {
    getCommentScope: app.ctx.split.commentScope,
    commentsContext: { getCachedCurrentUser: () => null } as unknown as CommentsContext,
    externalToolsContext: {
      suspendRenderer: () => void suspended.push("suspend"),
      resumeRenderer: () => void suspended.push("resume"),
    } as unknown as ExternalToolsContext,
    composerSettled: (outcome) => void settled.push(outcome),
    // A toast clears seconds on, long after this app is gone; drawing it then would land in another test.
    render: () => {
      if (!app.setup.renderer.isDestroyed) app.render()
    },
  })
  await app.frame()
  moveTo(app, keys.vimState, '  return "hello"')
  app.setup.mockInput.pressKey("c")
  await app.frame()
  expect(app.ctx.getState().inlineCommentOverlay.mode).toBe("compose")
  const textarea = composerTextareaIn(app.ctx.threadPanel.host)
  return { app, keys, textarea, settled, submitted, editor, suspended }
}

/**
 * A key as a kitty terminal reports it, with modifiers the mock cannot
 * encode, or a name the parser never produces (`enter`) over one it does.
 * Returned so a test can ask whether riff prevented it.
 */
export function send(app: Mounted, sequence: string, rename?: string): KeyEvent {
  const parsed = parseKeypress(sequence, { useKittyKeyboard: true })!
  const key = new KeyEvent(rename ? { ...parsed, name: rename } : parsed)
  app.setup.renderer.keyInput.emit("keypress", key)
  return key
}

export const overlay = (app: Mounted) => app.ctx.getState().inlineCommentOverlay
