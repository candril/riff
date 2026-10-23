/**
 * The folded files of the all-files diff: the files the reader closed with
 * `za`, `zc` or `zM`, and the ones riff closed for them because they were
 * viewed or ignored. They are how the reader chose to read the diff, not
 * review state, so the feature owns them rather than AppState (spec 100,
 * M6; ADR-003); a load seeds them from the viewed and ignored files.
 *
 * A reload keeps them, even a fold toggled while it was awaited, and folds
 * the files it finds newly viewed or ignored on top. A commit switch drops
 * them, and so does a switch to another review, which starts reading
 * afresh and seeds them from its own viewed and ignored files.
 */

import { createSignal } from "solid-js"

export type FileFoldsState = ReturnType<typeof createFileFoldsState>

export function createFileFoldsState() {
  const [collapsed, setCollapsed] = createSignal<ReadonlySet<string>>(new Set())

  return {
    collapsed,
    isCollapsed(filename: string): boolean {
      return collapsed().has(filename)
    },
    toggle(filename: string) {
      setCollapsed((filenames) => {
        const next = new Set(filenames)
        if (next.has(filename)) next.delete(filename)
        else next.add(filename)
        return next
      })
    },
    collapse(filenames: Iterable<string>) {
      const current = collapsed()
      const added = [...filenames].filter((filename) => !current.has(filename))
      if (added.length === 0) return
      setCollapsed(new Set([...current, ...added]))
    },
    expand(filenames: Iterable<string>) {
      const current = collapsed()
      const removed = [...filenames].filter((filename) => current.has(filename))
      if (removed.length === 0) return
      const next = new Set(current)
      for (const filename of removed) next.delete(filename)
      setCollapsed(next)
    },
    collapseAll(filenames: Iterable<string>) {
      setCollapsed(new Set(filenames))
    },
    clear() {
      if (collapsed().size === 0) return
      setCollapsed(new Set<string>())
    },
  }
}
