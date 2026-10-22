/**
 * The commit picker's state (spec 078). The feature owns it rather than
 * AppState, which sheds one slice per feature this way (spec 100, M6; ADR-003).
 */

import { batch, createSignal } from "solid-js"
import type { PrCommit } from "../../providers/github/types"

export interface CommitPickerSnapshot {
  query: string
  /** Whether `/` is open and taking what is typed (spec 078). */
  queryInput: boolean
  /** 0 is the "All commits" row. */
  selectedIndex: number
  /** The commits marked for the next scope, by sha. */
  marked: ReadonlySet<string>
  rangeAnchor: string | null
}

export type CommitPickerState = ReturnType<typeof createCommitPickerState>

export function createCommitPickerState() {
  const [open, setOpen] = createSignal(false)
  const [query, setQuery] = createSignal("")
  const [queryInput, setQueryInput] = createSignal(false)
  const [selectedIndex, setSelectedIndex] = createSignal(0)
  const [marked, setMarked] = createSignal<ReadonlySet<string>>(new Set())
  // Where `V` started extending, and what was marked before it did.
  const [rangeAnchor, setRangeAnchor] = createSignal<string | null>(null)
  const [markedBeforeRange, setMarkedBeforeRange] = createSignal<ReadonlySet<string>>(new Set())

  return {
    open,
    query,
    queryInput,
    selectedIndex,
    marked,
    rangeAnchor,
    markedBeforeRange,
    snapshot(): CommitPickerSnapshot {
      return {
        query: query(),
        queryInput: queryInput(),
        selectedIndex: selectedIndex(),
        marked: marked(),
        rangeAnchor: rangeAnchor(),
      }
    },
    /**
     * Opens on what is already in scope: the marks the last visit made are
     * still there, so reopening shows the selection rather than asking for
     * it again (spec 078).
     */
    show(scope: readonly string[] | null, commits: readonly PrCommit[]) {
      const next = new Set(scope ?? [])
      const first = commits.findIndex((commit) => next.has(commit.sha))
      batch(() => {
        setOpen(true)
        setQuery("")
        setQueryInput(false)
        // Row 0 is "all commits", so a commit's row is its index + 1.
        setSelectedIndex(first === -1 ? 0 : first + 1)
        setMarked(next)
        setRangeAnchor(null)
        setMarkedBeforeRange(next)
      })
    },
    close() {
      batch(() => {
        setOpen(false)
        setQuery("")
        setQueryInput(false)
        setRangeAnchor(null)
      })
    },
    setQuery(next: string) {
      batch(() => {
        setQuery(next)
        // Narrowing moves every row; a run being extended from a row that may
        // no longer be there is a run nobody can see. The marks stay.
        setRangeAnchor(null)
        setMarkedBeforeRange(marked())
        // On the first match rather than on "all commits": narrowing is how
        // you go and find a commit, not how you leave.
        setSelectedIndex(1)
      })
    },
    /** Wraps around at both ends. */
    move(delta: number, maxIndex: number) {
      let next = selectedIndex() + delta
      if (next < 0) next = maxIndex
      else if (next > maxIndex) next = 0
      batch(() => setSelectedIndex(next))
    },
    /** `Space` — this commit is in the scope, or is not. */
    toggleMark(sha: string) {
      const next = new Set(marked())
      if (next.has(sha)) next.delete(sha)
      else next.add(sha)
      batch(() => setMarked(next))
    },
    /**
     * `V` — start extending a run from here, or stop extending and keep what
     * is marked, so `j`/`k` move without changing it.
     */
    toggleRange(sha: string) {
      const before = marked()
      if (rangeAnchor() !== null) {
        batch(() => {
          setRangeAnchor(null)
          setMarkedBeforeRange(before)
        })
        return
      }
      const next = new Set(before)
      next.add(sha)
      batch(() => {
        setRangeAnchor(sha)
        setMarkedBeforeRange(before)
        setMarked(next)
      })
    },
    /** Everything between the anchor and the cursor, plus what was marked before. */
    markRange(shas: readonly string[]) {
      const next = new Set(markedBeforeRange())
      for (const sha of shas) next.add(sha)
      batch(() => setMarked(next))
    },
    /** `/` opens the filter; Esc or Enter closes it and leaves what it found. */
    startFilter() {
      batch(() => setQueryInput(true))
    },
    endFilter(keep: boolean) {
      batch(() => {
        setQueryInput(false)
        if (!keep) setQuery("")
      })
    },
  }
}
