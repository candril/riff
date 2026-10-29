import type { AppKeyContext } from "./key-context"
import type { LinksPicker } from "./links-picker"
import { threadPanelGeometry } from "./thread-panel-geometry"
import type { ThreadPanelKeyDeps } from "../features/inline-comment-overlay/view-keys"
import {
  getInlineCommentOverlayComments,
  getInlineCommentOverlayDisplayOrder,
  openInlineCommentOverlay,
} from "../state"
import { openCommentImages } from "../features/inline-comment-overlay/handlers"
import * as commentsFeature from "../features/comments"
import * as externalTools from "../features/external-tools"
import * as fileNavigation from "../features/file-navigation"
import * as prOperations from "../features/pr-operations"
import * as threadMotion from "../features/thread-motion"

/** What the thread panel's view-mode keys need of the app. */
export function threadPanelKeyDeps(ctx: AppKeyContext, links: LinksPicker): ThreadPanelKeyDeps {
  return {
    getState: ctx.getState,
    setState: ctx.setState,
    render: ctx.render,
    toast: ctx.toast,
    searchActive: () => ctx.getSearchState().active,
    filePicker: ctx.filePicker,
    commentsPicker: ctx.commentsPicker,
    occurrencePicker: ctx.occurrencePicker,
    marksPicker: ctx.marksPicker,
    commitPicker: ctx.commitPicker,
    actionMenu: ctx.actionMenu,
    activityFeed: ctx.activityFeed,
    prInfoFilter: ctx.prInfoFilter,
    prCommentInput: ctx.prCommentInput,
    chat: ctx.chat,
    commentDrafts: ctx.commentDrafts,
    composerPickers: ctx.composerPickers,
    codePeek: ctx.codePeek,
    handleReplyExternal: () =>
      commentsFeature.handleAddComment(ctx.commentsContext, { reply: true }),
    handleEditExternal: () =>
      commentsFeature.handleAddComment(ctx.commentsContext, { reply: true }),
    handleDelete: (comment) =>
      commentsFeature.handleDeleteComment(ctx.commentsContext, comment),
    handleSubmit: (comment) =>
      commentsFeature.handleSubmitSingleComment(ctx.commentsContext, comment),
    handleToggleResolved: (thread) =>
      prOperations.handleToggleThreadResolved(ctx.prOperationsContext, thread),
    handleToggleOpenOnly: () => ctx.toggleOpenThreadsOnly(),
    handleJumpAdjacent: (direction) =>
      threadMotion.jumpOverlayToAdjacentThread(direction, ctx.threadMotionContext),
    onToggleHelp: () => {
      ctx.help.toggle()
      ctx.render()
    },
    onReact: () => links.openReactPicker(),
    onOpenLinks: (comment, action) => {
      // The panel's comments, the highlighted one first: the same list
      // the overview offers, scoped to what this panel is showing.
      const rest = getInlineCommentOverlayComments(ctx.getState()).filter(
        (other) => other.id !== comment.id
      )
      links.openLinksPicker(
        [comment, ...rest].map((c) => ({
          title: `@${c.author || "you"}`,
          text: c.localEdit ?? c.body,
        })),
        links.linksTitle(action),
        action
      )
    },
    handleStartNewComment: () => {
      // Silently no-op when the cursor isn't on a commentable line —
      // the panel hint footer already advertises `n`, so the user
      // can move the cursor and try again.
      const lineMapping = ctx.getLineMapping()
      const vimState = ctx.getVimState()
      const anchor = lineMapping.getCommentAnchor(vimState.line, ctx.getCommentScope().pane)
      if (!anchor) {
        ctx.toast.show("Move cursor to a commentable line first", "info")
        ctx.render()
        setTimeout(() => {
          ctx.toast.clear()
          ctx.render()
        }, 2500)
        return
      }
      ctx.setState((s) =>
        openInlineCommentOverlay(
          s,
          anchor.filename,
          anchor.line,
          anchor.side,
          "compose",
          undefined,
          undefined,
          { draft: ctx.commentDrafts.on(anchor) }
        )
      )
      ctx.composerPickers.clear()
      ctx.codePeek.close()
      ctx.render()
    },
    handleCopyLink: (comment) => {
      void ctx.handleCopyCommentLink(comment)
    },
    handleOpenInEditor: (comment) => {
      void externalTools.handleOpenFileAtLine(
        ctx.externalToolsContext,
        comment.filename,
        comment.line
      )
    },
    handleOpenImages: (comment) => {
      openCommentImages(ctx, comment)
    },
    getPanelLayout: () => ctx.threadPanelLayout(),
    getPanelTextWidth: () => threadPanelGeometry(ctx.getState(), ctx.chat.column.open(), ctx.renderer, ctx.composer.value).budget.textWidth,
    syncCursorToHighlight: () => {
      // Cross-file moves switch files first in single-file view.
      const s = ctx.getState()
      const ov = s.inlineCommentOverlay
      if (!ov.open) return
      const derived = getInlineCommentOverlayDisplayOrder(s)
      const highlighted = derived[ov.highlightedIndex]
      if (!highlighted) return

      // Opened over the overview or the feed, the panel is talking about
      // code that is not on screen. Moving to a comment is the moment
      // the reader asked to see it, so the diff comes back then — not on
      // `Ctrl-t`, which is just "show me what was said". `Ctrl-o` goes
      // back to where the overview was.
      if (s.viewMode !== "diff") {
        ctx.setState((st) => ({ ...st, viewMode: "diff", previousView: st.viewMode }))
      }

      const inSingleFileView = s.selectedFileIndex !== null
      const targetFileIndex = s.files.findIndex((f) => f.filename === highlighted.filename)
      if (
        inSingleFileView &&
        targetFileIndex !== -1 &&
        targetFileIndex !== s.selectedFileIndex
      ) {
        fileNavigation.handleSelectFile(targetFileIndex, ctx.fileNavContext)
      } else {
        fileNavigation.ensureFileExpanded(highlighted.filename, ctx.fileNavContext)
      }

      const mapping = ctx.getLineMapping()
      const visualLine = mapping.findLineForComment(highlighted)
      if (visualLine !== null) {
        ctx.setVimState({ ...ctx.getVimState(), line: visualLine })
        ctx.ensureCursorVisible()
      }
    },
  }
}
