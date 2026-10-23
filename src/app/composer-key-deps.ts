import type { AppKeyContext } from "./key-context"
import type { ComposerKeyDeps } from "../features/inline-comment-overlay/composer-keys"
import { buildComposerEditorContext } from "../features/inline-comment-overlay/handlers"
import * as commentsFeature from "../features/comments"
import { openTextInEditor } from "../utils/editor/spawn"

/** What the thread panel's composer keys need of the app. */
export function composerKeyDeps(ctx: AppKeyContext): ComposerKeyDeps {
  return {
    getState: ctx.getState,
    setState: ctx.setState,
    render: ctx.render,
    toast: ctx.toast,
    mentions: ctx.mentions,
    commentDrafts: ctx.commentDrafts,
    getCachedCurrentUser: () => ctx.commentsContext.getCachedCurrentUser(),
    get composer() {
      return ctx.composer
    },
    composerSettled: (outcome) => ctx.composerSettled?.(outcome),
    handleSubmit: (comment) => commentsFeature.handleSubmitSingleComment(ctx.commentsContext, comment),
    getCommentedLines: () => {
      // What the comment replaces, read off the diff rows themselves —
      // the file's own text, not the padded display form (spec 076).
      const ov = ctx.getState().inlineCommentOverlay
      const mapping = ctx.getLineMapping()
      const wanted = ov.side === "LEFT" ? "oldLineNum" : "newLineNum"
      const from = ov.startLine ?? ov.line
      const found: string[] = []
      for (let row = 0; row < mapping.lineCount; row++) {
        const line = mapping.getLine(row)
        if (!line || line.filename !== ov.filename) continue
        const number = line[wanted]
        if (number === undefined || number < from || number > ov.line) continue
        if (line.type === (ov.side === "LEFT" ? "addition" : "deletion")) continue
        found.push(line.sourceContent ?? line.content)
      }
      return found.length > 0 ? found : null
    },
    openDraftInEditor: async (current) => {
      const s = ctx.getState()
      const username =
        (s.appMode === "pr" && ctx.commentsContext.getCachedCurrentUser()) || "@you"
      const context = buildComposerEditorContext(s, ctx.getLineMapping(), username)
      ctx.externalToolsContext.suspendRenderer()
      try {
        return await openTextInEditor(current, context)
      } finally {
        ctx.externalToolsContext.resumeRenderer()
      }
    },
  }
}
