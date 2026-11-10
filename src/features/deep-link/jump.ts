import type { AppState } from "../../state"
import { switchView } from "../../state"
import type { Comment } from "../../types"
import type { VimCursorState } from "../../vim-diff/types"
import type { DiffLineMapping } from "../../vim-diff/line-mapping"
import type { FlatConversationItem } from "../../components/pr-info-items"
import type { ToastState } from "../toast/state"
import { printableFragment, type LinkFragment, type LinkTarget } from "./parse"
import { fileForPathHash, reviewCommentForGithubId } from "./resolve"

export interface DeepLinkJumpDeps {
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
  toast: Pick<ToastState, "show" | "clear">
  later: (fn: () => void, ms: number) => void
  /** Before landing, so Ctrl-o goes back to where the reader was. */
  recordJump: () => void
  /** The comments picker's jump: the thread's line, its panel open on the comment. */
  openThread: (comment: Comment) => void
  openOverview: () => void
  revealConversationItem: (matches: (item: FlatConversationItem) => boolean) => boolean
  selectFile: (fileIndex: number) => void
  getLineMapping: () => DiffLineMapping
  getVimState: () => VimCursorState
  setVimState: (s: VimCursorState) => void
  ensureCursorVisible: () => void
}

const TOAST_MS = 4000

/**
 * Go where a PR link's fragment points (spec 115). What cannot be found is
 * said in a toast and the review stays where it is; nothing here throws, since
 * the fragment came from a click outside riff.
 */
export function followLink(fragment: LinkFragment, deps: DeepLinkJumpDeps): void {
  const missing = fragment.kind === "unknown"
    ? `Can't follow #${printableFragment(fragment.fragment)}`
    : land(fragment.target, deps)
  if (missing === null) return
  deps.toast.show(missing, "info")
  deps.render()
  deps.later(() => {
    deps.toast.clear()
    deps.render()
  }, TOAST_MS)
}

/** Null once landed; what was not found otherwise. */
function land(target: LinkTarget, deps: DeepLinkJumpDeps): string | null {
  const state = deps.getState()
  switch (target.kind) {
    case "review-comment": {
      const comment = reviewCommentForGithubId(state.comments, target.githubId)
      if (!comment) return "That review comment isn't on this PR anymore"
      deps.recordJump()
      deps.openThread(comment)
      return null
    }
    case "issue-comment":
      return reveal(deps, "That comment isn't on this PR anymore", (item) =>
        item.type === "pr-comment" && item.data.id === target.githubId
      )
    case "review":
      return reveal(deps, "That review isn't on this PR anymore", (item) =>
        item.type === "review-header" && item.data.databaseId === target.reviewId
      )
    case "file":
      return landOnFile(target, deps)
  }
}

function reveal(deps: DeepLinkJumpDeps, missing: string, matches: (item: FlatConversationItem) => boolean): string | null {
  deps.recordJump()
  deps.openOverview()
  const found = deps.revealConversationItem(matches)
  deps.render()
  return found ? null : missing
}

function landOnFile(target: Extract<LinkTarget, { kind: "file" }>, deps: DeepLinkJumpDeps): string | null {
  const state = deps.getState()
  const file = fileForPathHash(state.files, target.pathHash)
  if (!file) return "That file isn't in this PR's diff"
  deps.recordJump()
  if (state.viewMode !== "diff") deps.setState((s) => switchView(s, "diff"))
  deps.selectFile(state.files.indexOf(file))
  if (!target.line) return null

  const { side, number } = target.line
  const line = deps.getLineMapping().findLineForComment({ filename: file.filename, line: number, side })
  if (line === null) {
    deps.render()
    return `Line ${number} of ${file.filename} isn't in the diff`
  }
  deps.setVimState({ ...deps.getVimState(), line, col: 0, desiredCol: null })
  deps.ensureCursorVisible()
  deps.render()
  return null
}
