import type { AppState } from "../state"

type ColumnStatus = { col: number; total: number } | null

export interface ColumnStatusDeps {
  viewMode: AppState["viewMode"]
  split: { island: { columnStatus(): ColumnStatus } }
  unified: { columnStatus(): ColumnStatus }
}

/** Split only draws when there is a diff to draw; an error or an empty list keeps unified's surface. */
export function splitOn(state: Pick<AppState, "error" | "files">, split: { shown(): boolean }): boolean {
  return !state.error && state.files.length > 0 && split.shown()
}

/**
 * The status bar's `col n/total`. render.ts writes it on every pass, and
 * refreshCursor on every motion, which moves the cursor without a render.
 */
export function diffColumnStatus(split: boolean, deps: ColumnStatusDeps): ColumnStatus {
  if (deps.viewMode !== "diff") return null
  return split ? deps.split.island.columnStatus() : deps.unified.columnStatus()
}
