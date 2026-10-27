/**
 * The `g` chords, one command each, keyed by the sequence they are spelled
 * as: the opener, the chord suffix of the second key.
 */

import type { KeyEvent } from "@opentui/core"
import type { AppState } from "../state"
import type { HelpState } from "../features/help/state"
import type { BlameKeys } from "../features/blame/keys"
import type { CommentsPickerState } from "../features/comments-picker/state"
import type { LinePeekState } from "../features/line-peek/state"
import type { BlamePeekState } from "../features/blame/peek-state"
import * as prInfoPanelFeature from "../features/pr-info-panel"
import * as syncPreview from "../features/sync-preview"
import * as reviewPreview from "../features/review-preview"
import * as folds from "../features/folds"
import * as externalTools from "../features/external-tools"
import * as followLink from "../features/follow-link"
import type { VimMotionHandler } from "../vim-diff/motion-handler"

export interface GChordDeps {
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
  help: Pick<HelpState, "toggle">
  commentsPicker: Pick<CommentsPickerState, "show">
  executeAction: (id: string) => void
  reviewPreviewOpenContext: reviewPreview.ReviewPreviewOpenContext
  syncPreviewOpenContext: syncPreview.SyncPreviewOpenContext
  prInfoPanelOpenContext: prInfoPanelFeature.PRInfoPanelOpenContext
  externalToolsContext: externalTools.ExternalToolsContext
  foldsContext: folds.FoldsContext
  refreshContext: { handleRefresh: () => Promise<void> }
  followLinkContext: followLink.FollowLinkContext
  /** `gb` and `go`: the one object that owns every blame request, shared with the peek's layer. */
  blame: Pick<BlameKeys, "toggle" | "openLink">
  linePeek: Pick<LinePeekState, "open" | "toggle">
  blamePeek: Pick<BlamePeekState, "open">
  vimHandler: Pick<VimMotionHandler, "jumpToMatchingBracket">
}

// Both spellings of a shifted letter are accepted because terminals differ
// in whether shift+letter reports the key name as lower- or uppercase.
export const G_SEQUENCES = {
  "gS!": "openReviewPreview",
  "gs!": "openReviewPreview",
  gs: "openSyncPreview",
  go: "openLink",
  gi: "openPrInfo",
  gy: "copyPrUrl",
  "gB!": "openInBoard",
  "gb!": "openInBoard",
  "gY!": "copyPermalink",
  "gy!": "copyPermalink",
  gf: "followLink",
  "gF!": "followLinkInTmux",
  "gf!": "followLinkInTmux",
  gx: "followUrl",
  "gX!": "copyUrl",
  "gx!": "copyUrl",
  ge: "openInEditor",
  "gE!": "openInTmuxWindow",
  "ge!": "openInTmuxWindow",
  gc: "checkoutAndEdit",
  "gC!": "openCommentsPicker",
  "gc!": "openCommentsPicker",
  gd: "diffInEditor",
  "gD!": "diffInTmuxWindow",
  "gd!": "diffInTmuxWindow",
  "gP!": "editOrCreatePr",
  "gp!": "editOrCreatePr",
  gb: "toggleBlamePeek",
  gl: "toggleLinePeek",
  gm: "matchBracket",
  gr: "refresh",
  gg: "goToTop",
  "gG!": "goToBottom",
  "g?": "toggleHelp",
  "g?!": "toggleHelp",
} as const

export type GCommand = (typeof G_SEQUENCES)[keyof typeof G_SEQUENCES]

/**
 * Each command's key as the palette spells it, beside the action the
 * command runs, and the key the palette runs the command on. It matters
 * where several chords run one command: the palette names `gS`, not the
 * `gs!` a terminal may report for the same keys.
 */
export const G_PALETTE_KEYS: Partial<Record<GCommand, string>> = {
  openReviewPreview: "gS",
  openSyncPreview: "gs",
  openPrInfo: "gi",
  copyPrUrl: "gy",
  openInBoard: "gB",
  copyPermalink: "gY",
  followLink: "gf",
  followUrl: "gx",
  openInEditor: "ge",
  openInTmuxWindow: "gE",
  checkoutAndEdit: "gc",
  openCommentsPicker: "gC",
  diffInEditor: "gd",
  diffInTmuxWindow: "gD",
  editOrCreatePr: "gP",
  toggleLinePeek: "gl",
  refresh: "gr",
}

/**
 * Every command takes its key, whether or not it acts: no `g` chord leaves
 * one to the layers behind. `gC` reads the key for its preventDefault.
 */
export function gChordCommands(deps: GChordDeps): Record<GCommand, (key: KeyEvent) => boolean> {
  const taking = (run: (key: KeyEvent) => void) => (key: KeyEvent) => {
    run(key)
    return true
  }
  const inPr = () => {
    const s = deps.getState()
    return s.appMode === "pr" && s.prInfo ? s.prInfo : null
  }
  return {
    openReviewPreview: taking(() => reviewPreview.handleOpenReviewPreview(deps.reviewPreviewOpenContext)),
    openSyncPreview: taking(() => syncPreview.handleOpenSyncPreview(deps.syncPreviewOpenContext)),
    openLink: taking(() => {
      if (deps.getState().viewMode === "diff" && deps.blame.openLink()) return
      const prInfo = inPr()
      if (prInfo) {
        const { owner, repo, number: prNumber } = prInfo
        Bun.spawn(["gh", "pr", "view", String(prNumber), "--web", "-R", `${owner}/${repo}`])
      }
    }),
    openPrInfo: taking(() => {
      if (inPr()) prInfoPanelFeature.handleOpenPRInfoPanel(deps.prInfoPanelOpenContext)
    }),
    copyPrUrl: taking(() => {
      if (inPr()) deps.executeAction("copy-pr-url")
    }),
    openInBoard: taking(() => deps.executeAction("open-in-board")),
    copyPermalink: taking(() => deps.executeAction("copy-permalink")),
    followLink: taking(() => followLink.handleFollowLink(deps.followLinkContext)),
    followLinkInTmux: taking(() => followLink.handleFollowLink(deps.followLinkContext, { tmux: true })),
    followUrl: taking(() => followLink.handleFollowLink(deps.followLinkContext, { urlsOnly: true })),
    copyUrl: taking(() => followLink.handleFollowLink(deps.followLinkContext, { urlsOnly: true, copy: true })),
    openInEditor: taking(() => externalTools.handleOpenFileInEditor(deps.externalToolsContext)),
    openInTmuxWindow: taking(() => externalTools.handleOpenFileInTmuxWindow(deps.externalToolsContext)),
    checkoutAndEdit: taking(() => externalTools.handleCheckoutAndEdit(deps.externalToolsContext)),
    openCommentsPicker: taking((key) => {
      // spec 044: silent when there is nothing to search, so the chord
      // doesn't flash an empty modal.
      if (deps.getState().comments.length > 0) {
        key.preventDefault()
        deps.commentsPicker.show()
        deps.render()
      }
    }),
    // Both versions of this file, side by side (spec 075).
    diffInEditor: taking(() => void externalTools.handleDiffFileInEditor(deps.externalToolsContext)),
    diffInTmuxWindow: taking(
      () => void externalTools.handleDiffFileInEditor(deps.externalToolsContext, { tmux: true }),
    ),
    editOrCreatePr: taking(() => {
      if (inPr()) deps.executeAction("edit-pr")
      else if (deps.getState().appMode === "local") deps.executeAction("create-pr")
    }),
    toggleBlamePeek: taking(() => {
      // Who last changed the cursor's line, and the commit that says why (spec 103).
      if (deps.getState().viewMode === "diff") deps.blame.toggle()
    }),
    toggleLinePeek: taking(() => {
      // The whole line, wrapped, for when scrolling through it sideways
      // is more work than reading it is worth.
      deps.linePeek.toggle()
      deps.render()
    }),
    matchBracket: taking(() => {
      // `%` spelled so it needs no shift; the diff's own keys reach it only when it has the focus.
      const s = deps.getState()
      if (s.viewMode === "diff" && s.focusedPanel === "diff") deps.vimHandler.jumpToMatchingBracket()
    }),
    refresh: taking(() => void deps.refreshContext.handleRefresh()),
    goToTop: taking(() => folds.handleGoToTop(deps.foldsContext)),
    goToBottom: taking(() => folds.handleGoToBottom(deps.foldsContext)),
    toggleHelp: taking(() => {
      deps.help.toggle()
      deps.render()
    }),
  }
}
