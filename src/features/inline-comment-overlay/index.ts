/**
 * Inline Comment Overlay Feature (spec 039).
 *
 * Single, context-preserving overlay that handles every comment action
 * (read, reply, edit, delete, resolve, react, submit) without leaving
 * the diff. Replaces the old read-only ThreadPreview modal.
 */

export {
  handleInput,
  type InlineCommentOverlayInputContext,
  type ComposerOutcome,
} from "./input"

export {
  submitInlineDraft,
  submitInlineEditDraft,
  openCommentImages,
  buildComposerEditorContext,
  type InlineComposerHandlersContext,
} from "./handlers"

export { commentPanelWidth } from "./width"
