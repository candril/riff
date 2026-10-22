/**
 * The help overlay's state. The feature owns it rather than AppState, which
 * sheds one slice per feature this way (spec 100, M6; ADR-003).
 */

import { batch, createSignal } from "solid-js"

export type HelpState = ReturnType<typeof createHelpState>

export function createHelpState() {
  const [open, setOpen] = createSignal(false)
  const [scroll, setScroll] = createSignal(0)

  return {
    open,
    scroll,
    toggle() {
      batch(() => {
        setOpen((was) => !was)
        setScroll(0)
      })
    },
    close() {
      batch(() => {
        setOpen(false)
        setScroll(0)
      })
    },
    /**
     * Clamped here rather than in the view, as scrollPeek is not: the key
     * handler knows the terminal's height, so a held `j` stops at the last
     * row and `k` answers on its first press, even after a resize left the
     * scroll past what the taller window can scroll.
     */
    scrollBy(delta: number, maxScroll: number) {
      const drawn = Math.min(scroll(), maxScroll)
      setScroll(Math.max(0, Math.min(maxScroll, drawn + delta)))
    },
  }
}
