/**
 * The folded fenced blocks (spec 073): the code fences the reader closed
 * with `za`, `zA` or `zM`. They are how the reader chose to read the diff,
 * not review state, so the feature owns them rather than AppState (spec
 * 100, M6; ADR-003). A reload and a commit switch keep them; a switch to
 * another review drops them, because a block id names a fence in the old
 * diff.
 */

import { createSignal } from "solid-js"

export type BlockFoldsState = ReturnType<typeof createBlockFoldsState>

export function createBlockFoldsState() {
  const [collapsed, setCollapsed] = createSignal<ReadonlySet<string>>(new Set())

  return {
    collapsed,
    isCollapsed(id: string): boolean {
      return collapsed().has(id)
    },
    toggle(id: string) {
      setCollapsed((ids) => {
        const next = new Set(ids)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    },
    set(ids: readonly string[]) {
      setCollapsed(new Set(ids))
    },
    clear() {
      if (collapsed().size === 0) return
      setCollapsed(new Set<string>())
    },
  }
}
