import { createSignal } from "solid-js"
import type { FileBlame } from "../../providers/blame/types"

/** One file's blame column (spec 103 P2): asked for, or answered for each side it has. */
export type BlameColumnState = { status: "loading" } | { status: "ready"; head: FileBlame | null; base: FileBlame | null }

export type BlameColumnOutcome = { head: FileBlame | null; base: FileBlame | null } | { message: string }

export type BlameColumnsState = ReturnType<typeof createBlameColumnsState>

/**
 * The `zB` blame columns' state. The feature owns it rather than AppState,
 * which sheds one slice per feature this way (spec 100, M6; ADR-003). Every
 * change sets a new Map: the diff views' memos and the unified layout compare
 * the map by identity.
 */
export function createBlameColumnsState() {
  const [columns, setColumns] = createSignal<ReadonlyMap<string, BlameColumnState>>(new Map())

  const change = (edit: (next: Map<string, BlameColumnState>) => void) => {
    const next = new Map(columns())
    edit(next)
    setColumns(next)
  }

  const drop = (path: string) => {
    if (columns().has(path)) change((next) => next.delete(path))
  }

  return {
    columns,
    loading: (path: string) => columns().get(path)?.status === "loading",
    /** Turns a file's column off, or on and loading; the result says which, so the caller knows whether to fetch. */
    toggle(path: string): boolean {
      const on = !columns().has(path)
      change((next) => (on ? next.set(path, { status: "loading" }) : next.delete(path)))
      return on
    },
    /**
     * An answer for a column turned off since it was asked is dropped, so a
     * slow read cannot turn the column back on. A failure drops the column:
     * the caller says why, and there is nothing to draw.
     */
    settle(path: string, outcome: BlameColumnOutcome) {
      if (columns().get(path)?.status !== "loading") return
      if ("message" in outcome) drop(path)
      else change((next) => next.set(path, { status: "ready", head: outcome.head, base: outcome.base }))
    },
    drop,
    clear() {
      if (columns().size > 0) setColumns(new Map())
    },
  }
}
