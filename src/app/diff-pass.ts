import type { BlameColumns } from "../split-view/blame-cells"
import type { Mark } from "../features/marks/types"
import type { AppState } from "../state"
import type { FileContentCache, FileContentState } from "../features/file-content/state"
import type { FileParses, FileVersions } from "../vim-diff/file-parses"
import type { FlashState } from "../vim-diff/flash-state"
import type { DiffLineMapping } from "../vim-diff/line-mapping"
import type { SearchState } from "../vim-diff/search-state"
import type { VimCursorState } from "../vim-diff/types"
import { diffColumnStatus } from "./column-status"
import type { Frame } from "./frame"
import { selectionStatus } from "./selection-status"
import type { SplitDiff } from "./split-diff"
import type { UnifiedDiff } from "./unified-diff"

export interface DiffPassDeps {
  /** The files' own text and their parses, which both diff views colour rows from. */
  parses: FileParses
  fileContent: Pick<FileContentState, "contents">
  unified: UnifiedDiff
  split: SplitDiff
}

export interface DiffPassInput {
  state: AppState
  vimState: VimCursorState
  mapping: DiffLineMapping
  searchState: SearchState
  flashState: FlashState
  blameColumns: BlameColumns
  marks: readonly Mark[]
  /** False while something else takes the keys ahead of the diff, so its cursor is not shown. */
  focused: boolean
  /** Whether the diff is the view this pass shows, rather than an error, the overview, the feed or the empty text. */
  diffShown: boolean
  splitOn: boolean
}

/**
 * The text of the files riff has already read, so they can be highlighted
 * as files rather than as the rows on screen (spec 080).
 */
export function parsesOf(fileContentCache: FileContentCache): Map<string, FileVersions> {
  return new Map(
    Object.entries(fileContentCache).flatMap(([filename, entry]) =>
      entry?.newContent ? [[filename, { new: entry.newContent, old: entry.oldContent }] as const] : []
    )
  )
}

/** Both diff views drawn for one pass, and the status bar's readout of them. */
export function createDiffPass({ parses, fileContent, unified, split }: DiffPassDeps) {
  return {
    draw({ state, vimState, mapping, searchState, flashState, blameColumns, marks, focused, diffShown, splitOn }: DiffPassInput): void {
      if (diffShown) {
        parses.set(parsesOf(fileContent.contents()))
        // Fed while split is drawn too, so toggling back has nothing to rebuild.
        unified.draw({
          mapping,
          state,
          vimState,
          searchState,
          flashState,
          blameColumns,
          marks,
          emptyMessage: state.treeFilter ? `No files match /${state.treeFilter}` : "No changes to display",
          focused,
        })
        if (splitOn) split.draw({ mapping, state, vimState, searchState, flashState, blameColumns, marks })
      }
      // Every pass, whichever view it shows, so a view that stops being drawn knows it.
      unified.syncDrawn(diffShown && !splitOn)
      split.syncDrawn(splitOn, unified.viewportHeight())
      if (splitOn) split.island.update({ focused })
    },

    /** Read once the views have drawn: only their layout knows the columns and a selection's rows. */
    readout(splitOn: boolean, viewMode: AppState["viewMode"], vimState: VimCursorState): Frame["diff"] {
      return {
        columnInfo: diffColumnStatus(splitOn, { viewMode, split, unified }),
        // Split counts the rows it draws: a pair row holds a removal and an addition.
        selectionInfo: splitOn ? split.selectionStatus(vimState) : selectionStatus(vimState),
      }
    },
  }
}

export type DiffPass = ReturnType<typeof createDiffPass>
