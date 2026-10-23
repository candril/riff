import { getReviewProgress, getSelectedFile } from "../state"
import { mergeReading } from "../utils/merge-verdict"
import { version } from "../version"
import { headerModel } from "../components/header-model"
import { flashPromptModel, searchPromptModel } from "../components/prompt-line-model"
import { paletteMode } from "../features/action-menu"
import { actionMenuModel } from "../components/action-menu-model"
import { pickerModels } from "./picker-models"
import { overlayModels } from "./overlay-models"
import { chatColumnFrameModel, feedFrameModel, prInfoPanelFrameModel, threadPanelFrameInput } from "./panel-frame-models"
import { statusBarFrameModel } from "./chrome-frame-models"
import { composerModel } from "./composer-model"
import { openPromptModel } from "./open-prompt"
import type { Frame } from "./frame"

/**
 * What each island that follows the frame draws for `frame`, or null while
 * it is not shown. The key order is the order the islands update in. The
 * composer and the prompt go first because they focus their fields, and
 * every island that takes focus later has to come after them, in the order
 * each gives way to the next: the PR info panel's filter box, then the chat,
 * then the review preview's summary among the overlays.
 */
export function frameModels(frame: Frame) {
  const { state, vimState, searchState, flashState, width, height, now } = frame
  const pickers = pickerModels(state, frame, width, height, new Date(now))
  return {
    composer: composerModel(state),
    prompt: openPromptModel(state, searchState, frame),
    feed: feedFrameModel(frame),
    threadPanel: threadPanelFrameInput(frame),
    prInfoPanel: prInfoPanelFrameModel(frame),
    chatColumn: chatColumnFrameModel(frame),
    statusBar: statusBarFrameModel(frame),
    searchPrompt:
      (searchState.active || !!searchState.pattern) && state.viewMode === "diff" ? searchPromptModel(searchState) : null,
    flashPrompt: flashState.active && state.viewMode === "diff" ? flashPromptModel(flashState) : null,
    ...overlayModels(frame),
    filePicker: pickers.file,
    commentsPicker: pickers.comments,
    marksPicker: pickers.marks,
    occurrencePicker: pickers.occurrence,
    commitPicker: pickers.commit,
    actionMenu: frame.actionMenu
      ? actionMenuModel(paletteMode(state, vimState, frame.actionMenu), frame.actionMenu.selectedIndex, height, frame.commandKeys)
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
        lastRefreshedAt: frame.lastRefreshedAt,
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
  "composer",
  "prompt",
  "feed",
  "threadPanel",
  "prInfoPanel",
  "chatColumn",
  "statusBar",
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

const selfShown = ["composer", "prompt", "feed", "threadPanel", "prInfoPanel", "chatColumn", "statusBar", "header"] as const satisfies readonly FrameIslandId[]
export type SelfShownId = (typeof selfShown)[number]

/**
 * The followers the shell does not stack. The composer and the prompt have
 * no host of their own: they draw through fields other islands host. The
 * rest show and hide their own host: the header is always up, the feed and
 * the PR info panel sit in the view slot, which setView fills, the thread
 * panel and the chat in the panel slots, and the status bar is hidden only
 * by the flash line, which takes its row through the flash line's own show.
 */
export const SELF_SHOWN: ReadonlySet<FrameIslandId> = new Set(selfShown)

export function shownByShell(id: FrameIslandId): id is Exclude<FrameIslandId, SelfShownId> {
  return !SELF_SHOWN.has(id)
}
