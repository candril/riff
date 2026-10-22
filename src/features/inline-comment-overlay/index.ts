/**
 * Inline Comment Overlay Feature (spec 039).
 *
 * Single, context-preserving overlay that handles every comment action
 * (read, reply, edit, delete, resolve, react, submit) without leaving
 * the diff. Replaces the old read-only ThreadPreview modal.
 */

export { handleInput } from "./input"
export type { ThreadPanelViewDeps } from "./view-actions"

export {
  submitInlineDraft,
  submitInlineEditDraft,
  openCommentImages,
  buildComposerEditorContext,
  type InlineComposerHandlersContext,
} from "./handlers"

export { commentPanelWidth } from "./width"
