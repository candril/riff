import type { StatusBarProps } from "../components/StatusBar"
import type { Frame } from "./frame"

/** The status bar for `frame`, which is always up: only the flash line takes its row. */
export function statusBarFrameModel({ state, searchState, diff }: Frame): StatusBarProps {
  return {
    searchInfo:
      searchState.pattern && state.viewMode === "diff"
        ? {
            current: searchState.currentMatchIndex + 1,
            total: searchState.matches.length,
            pattern: searchState.pattern,
            wrapped: searchState.wrapped,
          }
        : null,
    columnInfo: diff.columnInfo,
    selectionInfo: diff.selectionInfo,
  }
}
