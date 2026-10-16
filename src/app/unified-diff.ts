import type { CliRenderer } from "@opentui/core"
import type { AppState } from "../state"
import type { FlashRegion } from "../vim-diff/flash-handler"
import type { FlashState } from "../vim-diff/flash-state"
import type { DiffLineMapping } from "../vim-diff/line-mapping"
import type { SearchState } from "../vim-diff/search-state"
import type { VimCursorState } from "../vim-diff/types"
import type { DiffHighlights } from "./diff-highlights"
import { diffPaneHeight, diffPaneWidth } from "./diff-layout"
import { searchOf } from "./diff-search"
import { unifiedSelection } from "./split-selection"
import { createUnifiedIsland } from "./unified-island"

export interface UnifiedDiffDeps {
  renderer: CliRenderer
  highlights: DiffHighlights
  scrollOff: number
  getState: () => AppState
  getMapping: () => DiffLineMapping
  getVimState: () => VimCursorState
  filePanelWidth: () => number
}

export interface UnifiedDrawInput {
  mapping: DiffLineMapping
  state: AppState
  vimState: VimCursorState
  searchState: SearchState
  flashState: FlashState
  emptyMessage: string
  /** False while an overlay, a composer or a prompt takes the keys ahead of the diff: its cursor is then not shown. */
  focused: boolean
}

/**
 * Everything the app needs to draw the diff unified, kept out of app.ts,
 * split-diff's counterpart and the only place that knows the island's API.
 */
export function createUnifiedDiff(deps: UnifiedDiffDeps) {
  const island = createUnifiedIsland(deps.renderer, deps.scrollOff)
  let drawn: { mapping: DiffLineMapping; file: number | null; wrap: boolean } | null = null

  const paneWidth = () => {
    const state = deps.getState()
    return diffPaneWidth(deps.renderer.width, { visible: state.showFilePanel, width: deps.filePanelWidth() })
  }

  /**
   * The island's rows are numbered by the mapping it last drew. A fold or
   * an expansion that rebuilt the app's mapping and asks for the cursor
   * before the next render would be revealed against rows that no longer
   * mean that line; the render's remap reveals it instead.
   */
  function syncCursor(): boolean {
    if (drawn?.mapping !== deps.getMapping()) return false
    const vimState = deps.getVimState()
    island.update({ cursor: { line: vimState.line, col: vimState.col }, selection: unifiedSelection(vimState) })
    return true
  }

  function refreshCursor(): void {
    if (!syncCursor()) return
    island.ensureCursorVisible()
    island.revealColumn()
  }

  /**
   * Everything a render hands the unified view, every pass, split or not,
   * so a toggle back from split has nothing to rebuild.
   */
  function draw(input: UnifiedDrawInput): void {
    const { mapping, state, vimState, searchState, flashState } = input
    const file = state.selectedFileIndex
    // A column kept from another file means nothing in this one. Null in all-files mode, so a switch
    // between the modes resets too; a fold keeps the file, and so the column, as split keeps its windows.
    const switched = drawn !== null && drawn.file !== file
    if (switched) island.resetColumns()
    // Wrap and a remap change which row the cursor's line is drawn on, and only a reveal follows it there.
    const moved = switched || drawn?.mapping !== mapping || drawn?.wrap !== state.wrapLines
    drawn = { mapping, file, wrap: state.wrapLines }
    island.update({
      mapping,
      files: state.files,
      lineSpans: deps.highlights.lineSpans,
      highlightVersion: deps.highlights.version(),
      comments: state.comments,
      fileStatuses: state.fileStatuses,
      expandingDivider: state.expandingDivider,
      cursor: { line: vimState.line, col: vimState.col },
      wrap: state.wrapLines,
      focused: input.focused,
      selection: unifiedSelection(vimState),
      search: searchOf(searchState),
      flash: flashState.active ? flashState.matches : null,
      emptyMessage: input.emptyMessage,
    })
    if (moved) {
      island.ensureCursorVisible()
      island.revealColumn()
    }
  }

  let drawnLastPass = false

  return {
    island,
    draw,
    refreshCursor,
    /** zz, zt and zb place the line the cursor is on, whichever path last moved it. */
    scrollCursorTo(where: "center" | "top" | "bottom"): void {
      if (syncCursor()) island.scrollCursorTo(where)
    },
    viewportHeight: () => island.viewportHeight(),
    /**
     * Called every pass. The host is only laid out once it is in the tree,
     * so the first frame unified draws is drawn at the pane's size. Only
     * the first: a host laid out before reports any size it comes back at
     * that differs, and a guess over a size it comes back at unchanged
     * would never be corrected.
     */
    syncDrawn(drawnNow: boolean): void {
      if (drawnNow && !drawnLastPass && island.viewportHeight() === 0) {
        island.seedSize(paneWidth(), diffPaneHeight(deps.renderer.height))
      }
      // The block is placed from the host's render hook, which stops with the host out of the tree, and
      // the island lives on to be drawn again, so nothing else hides it over split or the error text.
      if (drawnLastPass && !drawnNow) deps.renderer.setCursorPosition(0, 0, false)
      drawnLastPass = drawnNow
    },
    visibleFilenames: () => island.visibleFilenames(),
    visibleRegion: (): FlashRegion | null => island.visibleRegion(),
    columnStatus: () => island.columnStatus(),
    setOnCursorScrolledAway: (cb: (line: number) => void) => island.setOnCursorScrolledAway(cb),
    dispose(): void {
      island.dispose()
    },
  }
}

export type UnifiedDiff = ReturnType<typeof createUnifiedDiff>
