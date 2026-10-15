import type { CliRenderer } from "@opentui/core"
import { LineSpans, sideOf } from "../diff-rows/line-spans"
import { RowLineSource } from "../diff-rows/row-source"
import { contentOrigin, gutterWidth, paneWidths } from "../split-view/layout"
import type { AppState } from "../state"
import type { FileParses } from "../vim-diff/file-parses"
import type { FlashRegion } from "../vim-diff/flash-handler"
import type { DiffLineMapping } from "../vim-diff/line-mapping"
import type { VimCursorState } from "../vim-diff/types"
import { diffPaneWidth, splitShown } from "./diff-layout"
import { paneOfLine, rowOfLine } from "./split-cursor"
import { createSplitIsland } from "./split-island"

export interface SplitDiffDeps {
  renderer: CliRenderer
  parses: FileParses
  scrollOff: number
  getState: () => AppState
  getMapping: () => DiffLineMapping
  getVimState: () => VimCursorState
  filePanelWidth: () => number
  render: () => void
  /** The pane crossed 120 columns while split is requested; only a full render swaps the views. */
  onShownChanged: () => void
}

const COLOURABLE = new Set(["context", "addition", "deletion", "no-newline"])

/**
 * Everything the app needs to draw the diff side by side, kept out of
 * app.ts: the island, the rows over the current mapping and the colours
 * the halves read. The app's cursor stays in mapping lines; this turns it
 * into a row only to draw it.
 */
export function createSplitDiff(deps: SplitDiffDeps) {
  const island = createSplitIsland(deps.renderer, deps.scrollOff)
  const lineSpans = new LineSpans(deps.parses)
  let highlightVersion = 0
  let built: { mapping: DiffLineMapping; source: RowLineSource } | null = null

  function highlightsLanded(): void {
    highlightVersion++
    deps.render()
  }
  lineSpans.onSpans = highlightsLanded

  /** Rebuilt with the mapping, which a fold or an expansion replaces; the pane the cursor is in carries over. */
  function source(): RowLineSource {
    const mapping = deps.getMapping()
    if (built?.mapping !== mapping) {
      built = { mapping, source: new RowLineSource(mapping, "split", built?.source.side) }
    }
    return built.source
  }

  const paneWidth = () => {
    const state = deps.getState()
    return diffPaneWidth(deps.renderer.width, { visible: state.showFilePanel, width: deps.filePanelWidth() })
  }

  function shown(): boolean {
    const state = deps.getState()
    return state.viewMode === "diff" && splitShown(state.splitView, paneWidth(), deps.getMapping().lineCount)
  }

  let drawnLastPass = false

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
  }

  return {
    island,
    lineSpans,
    source,
    shown,
    rowAtLine,
    cursorRow,
    highlightVersion: () => highlightVersion,
    highlightsLanded,
    /** Called every pass; the pane unified fills is the size split takes when it comes in. */
    syncDrawn(drawn: boolean, unifiedHeight: number): void {
      if (drawn && !drawnLastPass) island.seedSize(paneWidth(), unifiedHeight || island.viewportHeight())
      drawnLastPass = drawn
    },
    /** A removed line opens in the old pane, anything else in the new one. */
    enter(): void {
      const mapping = deps.getMapping()
      source().setSide(sideOf(mapping.allLines, deps.getVimState().line) === "old" ? "left" : "right")
    },
    syncPane,
    refreshCursor,
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
    /** Flash searches the active pane's columns; drawing its labels in split comes later. */
    visibleRegion(): FlashRegion {
      const width = paneWidths(island.width())[source().side]
      const code = Math.max(0, width - contentOrigin(gutterWidth(deps.getMapping())))
      return { lines: island.visibleLines(), startCol: 0, endCol: code }
    },
    dispose(): void {
      deps.renderer.off("resize", onResize)
      island.dispose()
      lineSpans.dispose()
    },
  }
}

export type SplitDiff = ReturnType<typeof createSplitDiff>
