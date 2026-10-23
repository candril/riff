import type { CliRenderer } from "@opentui/core"
import { commentScope, type CommentScope } from "../diff-rows/comment-scope"
import { sideOf } from "../diff-rows/line-spans"
import { RowLineSource, rowOfLine, type SplitRows } from "../diff-rows/row-source"
import type { BlameColumns } from "../split-view/blame-cells"
import type { Mark } from "../features/marks/types"
import type { AppState } from "../state"
import type { FlashRegion } from "../vim-diff/flash-handler"
import type { FlashState } from "../vim-diff/flash-state"
import type { DiffLineMapping } from "../vim-diff/line-mapping"
import type { SearchState } from "../vim-diff/search-state"
import type { VimCursorState } from "../vim-diff/types"
import type { DiffHighlights } from "./diff-highlights"
import { diffPaneWidthOf, splitShown } from "./diff-layout"
import { searchOf } from "./diff-search"
import { selectionStatus } from "./selection-status"
import { paneOfLine, toRowSelection } from "./split-cursor"
import { createSplitIsland } from "./split-island"
import { splitSelection } from "./split-selection"
import type { DiffOptionsState } from "../features/diff-view/options-state"

export interface SplitDiffDeps {
  renderer: CliRenderer
  highlights: DiffHighlights
  scrollOff: number
  getState: () => AppState
  diffOptions: Pick<DiffOptionsState, "splitView">
  getMapping: () => DiffLineMapping
  getVimState: () => VimCursorState
  filePanelWidth: () => number
  /** The pane crossed 120 columns while split is requested; only a full render swaps the views. */
  onShownChanged: () => void
}

export interface SplitDrawInput {
  mapping: DiffLineMapping
  state: AppState
  vimState: VimCursorState
  searchState: SearchState
  flashState: FlashState
  blameColumns: BlameColumns
  marks: readonly Mark[]
}

const COLOURABLE = new Set(["context", "addition", "deletion", "no-newline"])

/**
 * Everything the app needs to draw the diff side by side, kept out of
 * app.ts: the island and the rows over the current mapping. The app's
 * cursor stays in mapping lines; this turns it into a row only to draw it.
 */
export function createSplitDiff(deps: SplitDiffDeps) {
  const island = createSplitIsland(deps.renderer, deps.scrollOff)
  let built: { mapping: DiffLineMapping; source: RowLineSource } | null = null

  /** Rebuilt with the mapping, which a fold or an expansion replaces; the pane the cursor is in carries over. */
  function source(): RowLineSource {
    const mapping = deps.getMapping()
    if (built?.mapping !== mapping) {
      built = { mapping, source: new RowLineSource(mapping, "split", built?.source.side) }
    }
    return built.source
  }

  const paneWidth = () => diffPaneWidthOf(deps.getState(), deps.renderer.width, deps.filePanelWidth())

  function shown(): boolean {
    const state = deps.getState()
    return state.viewMode === "diff" && splitShown(deps.diffOptions.splitView(), paneWidth(), deps.getMapping().lineCount)
  }

  let drawnLastPass = false
  let paneWidthLastDrawn: number | null = null

  // The layout follows a resize on its own, but which view draws the diff
  // is decided in render(), and below 120 columns unified must take over.
  const onResize = () => {
    if (shown() !== drawnLastPass) deps.onShownChanged()
  }
  deps.renderer.on("resize", onResize)

  const rowAtLine = (line: number) => rowOfLine(line, source())
  const cursorRow = () => rowAtLine(deps.getVimState().line)

  /**
   * A search hit or a jump lands on a line, and the cursor's pane follows it
   * there. Many paths only assign the app's cursor, so every draw and every
   * reveal syncs rather than trusting one of them to have done it.
   */
  function syncPane(): void {
    const rows = source()
    const pane = paneOfLine(deps.getVimState().line, rows)
    if (pane) rows.setSide(pane)
  }

  function refreshCursor(): void {
    syncPane()
    const row = cursorRow()
    island.update({ cursor: { row, col: deps.getVimState().col }, side: source().side })
    island.ensureCursorVisible(row)
    island.revealColumn()
  }

  let drawnFile: number | null | undefined

  /**
   * Everything a render hands the split view. Flash on a list surface still
   * dims unified's diff, so it dims split's too.
   */
  function draw(input: SplitDrawInput): void {
    const { mapping, state, vimState, searchState, flashState, blameColumns, marks } = input
    syncPane()
    // An offset kept from another file means nothing in this one. Null in all-files mode, so a switch
    // between the modes resets too; a fold keeps the file, and so the windows, as unified keeps its scrollLeft.
    if (state.selectedFileIndex !== drawnFile) {
      if (drawnFile !== undefined) island.resetColumns()
      drawnFile = state.selectedFileIndex
    }
    island.update({
      mapping,
      source: source(),
      files: state.files,
      lineSpans: deps.highlights.lineSpans,
      highlightVersion: deps.highlights.version(),
      comments: state.comments,
      marks,
      blameColumns,
      fileStatuses: state.fileStatuses,
      expandingDivider: state.expandingDivider,
      cursor: { row: cursorRow(), col: vimState.col },
      side: source().side,
      focused: true,
      selection: splitSelection(vimState, source()),
      search: searchOf(searchState),
      flash: flashState.active ? flashState.matches : null,
    })
  }

  return {
    island,
    source,
    shown,
    rowAtLine,
    cursorRow,
    /**
     * Called every pass; the pane unified fills is the size split takes when
     * it comes in. A width that changes in this pass, with the tree or the
     * thread panel, is taken from the state, as unified takes it: the host
     * reports its own only after the frame drawn at the old one.
     */
    syncDrawn(drawn: boolean, unifiedHeight: number): void {
      if (drawn) {
        const width = paneWidth()
        if (!drawnLastPass) island.seedSize(width, unifiedHeight || island.viewportHeight())
        else if (width !== paneWidthLastDrawn) island.seedSize(width, island.viewportHeight())
        paneWidthLastDrawn = width
      }
      drawnLastPass = drawn
    },
    /** A removed line opens in the old pane, anything else in the new one. */
    enter(): void {
      const mapping = deps.getMapping()
      source().setSide(sideOf(mapping.allLines, deps.getVimState().line) === "old" ? "left" : "right")
      island.resetColumns()
    },
    syncPane,
    refreshCursor,
    /**
     * What a comment or a link is written on. Read before any draw may have
     * synced the pane, so a jump that landed on the other half is honoured.
     */
    commentScope(): CommentScope {
      if (!shown()) return commentScope(deps.getVimState(), null)
      syncPane()
      return commentScope(deps.getVimState(), source())
    },
    /** The rows commentScope reads in split; null while unified is drawn. */
    splitRows(): SplitRows | null {
      return shown() ? source() : null
    },
    /** The status bar counts the rows a selection spans, as the split view draws them. */
    selectionStatus(vimState: VimCursorState) {
      return selectionStatus(toRowSelection(vimState, source()))
    },
    draw,
    revealCursor: refreshCursor,
    visibleFilenames(): string[] {
      const mapping = deps.getMapping()
      const names = new Set<string>()
      for (const index of island.visibleLines()) {
        const line = mapping.getLine(index)
        if (line?.filename && COLOURABLE.has(line.type)) names.add(line.filename)
      }
      return [...names]
    },
    /** Each pane is scrolled on its own, so flash searches every line in the window it is drawn in. */
    visibleRegion(): FlashRegion {
      const cursorWindow = island.lineWindow(deps.getVimState().line)
      return { lines: island.visibleLines(), ...cursorWindow, windowsOf: island.lineWindows }
    },
    dispose(): void {
      deps.renderer.off("resize", onResize)
      island.dispose()
    },
  }
}

export type SplitDiff = ReturnType<typeof createSplitDiff>
