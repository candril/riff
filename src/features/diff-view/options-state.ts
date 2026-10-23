/**
 * The diff's display options: soft wrap (`zw`), the side-by-side split
 * (`\`, drawn only where the pane is wide enough) and markdown table
 * alignment. They are how the reader chose to look at the diff, not review
 * state, so the feature owns them rather than AppState (spec 100, M6;
 * ADR-003). The config seeds wrap and table alignment, the split starts
 * off, and a reload or a switch to another PR keeps all three.
 */

import { createSignal } from "solid-js"

export type DiffOptionsState = ReturnType<typeof createDiffOptionsState>

export function createDiffOptionsState(initial: { wrap: boolean; alignMarkdownTables: boolean }) {
  const [wrapLines, setWrapLines] = createSignal(initial.wrap)
  const [splitView, setSplitView] = createSignal(false)
  const [alignMarkdownTables] = createSignal(initial.alignMarkdownTables)

  return {
    wrapLines,
    splitView,
    alignMarkdownTables,
    toggleWrap() {
      setWrapLines((on) => !on)
    },
    toggleSplit() {
      setSplitView((on) => !on)
    },
  }
}
