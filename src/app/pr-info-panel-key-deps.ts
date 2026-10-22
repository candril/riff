import type { AppKeyContext } from "./key-context"
import type { LinksPicker } from "./links-picker"
import type { PRInfoPanelKeyDeps } from "../features/pr-info-panel/keys"
import { toggleHelp } from "../state"
import { groupIntoThreads } from "../utils/threads"
import * as commentsPicker from "../features/comments-picker"
import * as externalTools from "../features/external-tools"
import * as fileNavigation from "../features/file-navigation"
import * as prOperations from "../features/pr-operations"

/** What the PR overview's keys need of the app. */
export function prInfoPanelKeyDeps(ctx: AppKeyContext, links: LinksPicker): PRInfoPanelKeyDeps {
  return {
    getState: ctx.getState,
    setState: ctx.setState,
    render: ctx.render,
    getPanel: ctx.getPrInfoPanel,
    onJumpToFile: (filename) => {
      // Jump to file by filename.
      // input handler BEFORE closePRInfoPanel, so the jump captures
      // viewMode="pr" — back-jump can return to the PR view.
      const state = ctx.getState()
      const fileIndex = state.files.findIndex((f) => f.filename === filename)
      if (fileIndex !== -1) {
        fileNavigation.handleSelectFile(fileIndex, ctx.fileNavContext)
      }
    },
    onOpenThread: (rootCommentId) => {
      // Enter on a Conversation thread lands on the thread view. The
      // panel already closed (back into the diff), so reuse the
      // comments-picker jump: switch file, park the cursor on the
      // anchor line, open the inline comment overlay.
      const comment = ctx.getState().comments.find((c) => c.id === rootCommentId)
      if (!comment) return
      commentsPicker.jumpToComment(comment, {
        getState: ctx.getState,
        setState: ctx.setState,
        getVimState: ctx.getVimState,
        setVimState: ctx.setVimState,
        getLineMapping: ctx.getLineMapping,
        ensureCursorVisible: ctx.ensureCursorVisible,
        render: ctx.render,
        fileNavContext: ctx.fileNavContext,
      })
    },
    onOpenFileAtLine: (filename, line) => {
      void externalTools.handleOpenFileAtLine(ctx.externalToolsContext, filename, line)
    },
    onActivateCommit: (sha) => {
      // Activate commit (set viewing commit). Jump push happens in
      // the panel input handler before closePRInfoPanel.
      ctx.onCommitSelected(sha)
    },
    onToggleThreadResolved: (rootCommentId) => {
      // Resolve the review thread whose root has this id. Built from
      // live state.comments so mutations/refresh reflect immediately.
      const state = ctx.getState()
      const threads = groupIntoThreads(state.comments)
      const thread = threads.find((t) => t.id === rootCommentId)
      if (!thread) return
      void prOperations.handleToggleThreadResolved(ctx.prOperationsContext, thread)
    },
    executeAction: ctx.executeAction,
    onOpenLinks: (action) => {
      const sources = ctx.getPrInfoPanel()?.linkSources() ?? []
      links.openLinksPicker(sources, links.linksTitle(action), action)
    },
    onToggleHelp: () => {
      ctx.setState(toggleHelp)
      ctx.render()
    },
    onReact: () => links.openReactPicker(),
    onPreviewRow: (action, row) => {
      // Several places for one app: the same picker every other list of
      // links uses, told whether it was `Enter` or `y` that asked. Only
      // this row, because the key was pressed on this row.
      links.openLinksPicker(
        [{ title: row.app, links: row.links }],
        `${action === "open" ? "Open" : "Copy"} — ${row.app}`,
        action
      )
    },
  }
}
