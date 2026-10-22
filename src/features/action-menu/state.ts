/**
 * The command palette's state. The feature owns it rather than AppState,
 * which sheds one slice per feature this way (spec 100, M6; ADR-003).
 */

import { batch, createSignal } from "solid-js"
import type { ActionSubmenu } from "../../actions/types"

export interface ActionMenuSnapshot {
  query: string
  selectedIndex: number
  /** What replaces the action list for now, or null for the list itself (spec 042). */
  submenu: ActionSubmenu | null
}

export type ActionMenuState = ReturnType<typeof createActionMenuState>

export function createActionMenuState() {
  const [open, setOpen] = createSignal(false)
  const [query, setQuery] = createSignal("")
  const [selectedIndex, setSelectedIndex] = createSignal(0)
  const [submenu, setSubmenu] = createSignal<ActionSubmenu | null>(null)

  const reset = (isOpen: boolean, next: ActionSubmenu | null) => {
    batch(() => {
      setOpen(isOpen)
      setQuery("")
      setSelectedIndex(0)
      setSubmenu(next)
    })
  }

  return {
    open,
    query,
    selectedIndex,
    submenu,
    snapshot(): ActionMenuSnapshot {
      return { query: query(), selectedIndex: selectedIndex(), submenu: submenu() }
    },
    show() {
      reset(true, null)
    },
    close() {
      reset(false, null)
    },
    /**
     * Swap the palette into a submenu, opening it first if it is closed.
     * Resets query + selection so fuzzy matching and up/down start fresh
     * inside the new context (spec 042).
     */
    showSubmenu(next: ActionSubmenu) {
      reset(true, next)
    },
    /**
     * Back out of a submenu to the main action list. Query/selection reset
     * so the user doesn't see a filter they didn't type.
     */
    closeSubmenu() {
      if (submenu() === null) return
      reset(true, null)
    },
    setQuery(next: string) {
      batch(() => {
        setQuery(next)
        setSelectedIndex(0)
      })
    },
    /** Wraps around at both ends. */
    move(delta: number, maxIndex: number) {
      let next = selectedIndex() + delta
      if (next < 0) next = maxIndex
      else if (next > maxIndex) next = 0
      batch(() => setSelectedIndex(next))
    },
  }
}
