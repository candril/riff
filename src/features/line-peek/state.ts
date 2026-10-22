/**
 * The `gl` line peek's state. The feature owns it rather than AppState,
 * which sheds one slice per feature this way (spec 100, M6; ADR-003).
 */

import { batch, createSignal } from "solid-js"

export type PeekSide = "new" | "old"

export interface LinePeekSnapshot {
  /** Which version of a changed block the peek is drawing (spec 058). */
  side: PeekSide
  /** Where a peek too big for the window is scrolled to, in rows and
   *  columns of the drawing. The view clamps it to what there is. */
  scroll: { row: number; col: number }
}

export type LinePeekState = ReturnType<typeof createLinePeekState>

const SCROLL_CAP = 100_000

const clamp = (value: number) => Math.max(0, Math.min(SCROLL_CAP, value))

export function createLinePeekState() {
  const [open, setOpen] = createSignal(false)
  const [side, setSide] = createSignal<PeekSide>("new")
  const [scroll, setScroll] = createSignal({ row: 0, col: 0 })

  return {
    open,
    side,
    scroll,
    snapshot(): LinePeekSnapshot {
      return { side: side(), scroll: scroll() }
    },
    toggle() {
      batch(() => {
        setOpen(!open())
        // Every peek opens on the version the change arrives at, at its top.
        setSide("new")
        setScroll({ row: 0, col: 0 })
      })
    },
    close() {
      if (open()) setOpen(false)
    },
    /**
     * Scroll a peek that does not fit. Unbounded here — the view knows the
     * drawing's size and clamps — but not by so much that a held key runs off.
     */
    scrollBy(rows: number, cols: number) {
      const { row, col } = scroll()
      setScroll({ row: clamp(row + rows), col: clamp(col + cols) })
    },
    /**
     * Swap the peek between the version the change arrives at and the one it
     * replaces (spec 058).
     */
    swapSide() {
      batch(() => {
        setSide(side() === "new" ? "old" : "new")
        setScroll({ row: 0, col: 0 })
      })
    },
  }
}
