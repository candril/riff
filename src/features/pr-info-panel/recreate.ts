import type { PRInfoPanelClass } from "../../components/PRInfoPanel"
import type { PrInfo } from "../../providers/github/types"
import type { AppState, PRInfoPanelSection } from "../../state"
import type { Comment } from "../../types"
import type { DiffFile } from "../../utils/diff-parser"
import { rereadsLookups, sectionsForRebuild, type RecreatePrInfoPanel } from "./rebuild"

export interface PrInfoPanelRecreateDeps {
  getState: () => Pick<AppState, "appMode" | "prInfo" | "files" | "comments">
  getPanel: () => PRInfoPanelClass | null
  setPanel: (panel: PRInfoPanelClass) => void
  build: (
    prInfo: PrInfo,
    files: DiffFile[],
    comments: Comment[],
    openSections: ReadonlySet<PRInfoPanelSection> | undefined
  ) => PRInfoPanelClass
  /** The sections saved for the review when riff started. */
  saved: ReadonlySet<PRInfoPanelSection>
  /** Hooks the new panel up to the app; `reread` asks the base lookups again. */
  wire: (panel: PRInfoPanelClass, rebuild: { reread: boolean }) => void
  rebuilt: () => void
}

/**
 * Builds the PR info panel afresh from the PR data in state, in place of
 * the one there is, if any: the panel caches prInfo, files and comments.
 */
export function createPrInfoPanelRecreate(deps: PrInfoPanelRecreateDeps): RecreatePrInfoPanel {
  return (openSections, rebuild) => {
    const state = deps.getState()
    if (state.appMode !== "pr" || !state.prInfo) return
    const previous = deps.getPanel()
    // The panel is where the reader was, not just what it shows: rebuilt
    // from scratch it would drop them back on the description's header.
    const position = previous?.capturePosition()
    const hadPanel = previous !== null
    previous?.destroy()
    const sections = sectionsForRebuild(openSections, { hadPanel, saved: deps.saved })
    const panel = deps.build(state.prInfo, state.files, state.comments, sections)
    deps.setPanel(panel)
    deps.wire(panel, { reread: rereadsLookups(rebuild, { hadPanel }) })
    if (position) panel.restorePosition(position)
    deps.rebuilt()
  }
}
