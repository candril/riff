import { getReviewProgress, getSelectedFile } from "../state"
import { mergeReading } from "../utils/merge-verdict"
import { version } from "../version"
import { headerModel } from "../components/header-model"
import { flashPromptModel, searchPromptModel } from "../components/prompt-line-model"
import { paletteMode } from "../features/action-menu"
import { actionMenuModel } from "../components/action-menu-model"
import { pickerModels } from "./picker-models"
import { overlayModels } from "./overlay-models"
import { feedFrameModel, threadPanelFrameInput } from "./panel-frame-models"
import type { Frame } from "./frame"

/**
 * What each island that follows the frame draws for `frame`, or null while
 * it is not shown. The key order is the order the islands update in: the
 * feed and the thread panel first, as render.ts pushed them ahead of every
 * other island.
 */
export function frameModels(frame: Frame) {
  const { state, vimState, searchState, flashState, width, height, now } = frame
  const pickers = pickerModels(state, width, height, new Date(now))
  return {
    feed: feedFrameModel(frame),
    threadPanel: threadPanelFrameInput(frame),
    searchPrompt:
      (searchState.active || !!searchState.pattern) && state.viewMode === "diff" ? searchPromptModel(searchState) : null,
    flashPrompt: flashState.active && state.viewMode === "diff" ? flashPromptModel(flashState) : null,
    ...overlayModels(frame),
    filePicker: pickers.file,
    commentsPicker: pickers.comments,
    marksPicker: pickers.marks,
    occurrencePicker: pickers.occurrence,
    commitPicker: pickers.commit,
    actionMenu: state.actionMenu.open
      ? actionMenuModel(paletteMode(state, vimState), state.actionMenu.selectedIndex, height)
      : null,
    header: {
      ...headerModel({
        title: "riff",
        selectedFile: getSelectedFile(state),
        totalFiles: state.files.length,
        prInfo: state.prInfo,
        reviewProgress: getReviewProgress(state),
        branchInfo: state.branchInfo,
        viewingCommit: state.viewingCommit,
        viewingCommitScope: state.viewingCommitScope,
        branchPr: state.branchPr,
        commits: state.commits,
        lastRefreshedAt: state.lastRefreshedAt,
        merge: state.prInfo ? mergeReading(state.prInfo, state.prInfo.checks ?? [], state.comments) : null,
      }),
      version,
    },
  }
}

export type FrameModels = ReturnType<typeof frameModels>
export type FrameIslandId = keyof FrameModels

/** Every key of frameModels, in its order, which is the order the islands update in. */
export const FRAME_ISLANDS = [
  "feed",
  "threadPanel",
  "searchPrompt",
  "flashPrompt",
  "toast",
  "confirmDialog",
  "reviewPreview",
  "syncPreview",
  "helpOverlay",
  "diffPeek",
  "blamePeek",
  "hunkPeek",
  "filePicker",
  "commentsPicker",
  "marksPicker",
  "occurrencePicker",
  "commitPicker",
  "actionMenu",
  "header",
] as const satisfies readonly FrameIslandId[]

// Fails to compile while a key of frameModels is missing from FRAME_ISLANDS,
// which would leave that island never drawn.
const everyIslandFollowed: [Exclude<FrameIslandId, (typeof FRAME_ISLANDS)[number]>] extends [never] ? true : never = true

const selfShown = ["feed", "threadPanel", "header"] as const satisfies readonly FrameIslandId[]
export type SelfShownId = (typeof selfShown)[number]

/**
 * The followers that show and hide their own host, which the shell does not
 * stack: the header is always up, and the feed and the thread panel sit in
 * the view and the panel slots.
 */
export const SELF_SHOWN: ReadonlySet<FrameIslandId> = new Set(selfShown)

export function shownByShell(id: FrameIslandId): id is Exclude<FrameIslandId, SelfShownId> {
  return !SELF_SHOWN.has(id)
}
