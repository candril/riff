/**
 * The files shown as their plain diff rather than read nested (spec 116).
 *
 * Nested is the default, so the state is the exceptions: `.diff` and
 * `.patch` files, and deleted files paired with one, the reader asked to
 * see raw. How the reader chose to read a file, not review state, so the
 * feature owns it (ADR-003); a switch to another review drops it.
 */

import { createSignal } from "solid-js"

export type NestedDiffState = ReturnType<typeof createNestedDiffState>

export function createNestedDiffState() {
  const [raw, setRaw] = createSignal<ReadonlySet<string>>(new Set())

  return {
    raw,
    isRaw(filename: string): boolean {
      return raw().has(filename)
    },
    toggle(filename: string) {
      setRaw((current) => {
        const next = new Set(current)
        if (next.has(filename)) next.delete(filename)
        else next.add(filename)
        return next
      })
    },
    clear() {
      if (raw().size === 0) return
      setRaw(new Set<string>())
    },
  }
}
