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
} from "./input"

export {
  submitInlineDraft,
  submitInlineEditDraft,
  type InlineComposerHandlersContext,
} from "./handlers"
