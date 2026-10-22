/**
 * The activity feed's state (spec 070). The feed keeps its row, its filters
 * and its opened commits across view switches and reloads, so it lives in
 * the feature rather than in the view, and AppState sheds one slice per
 * feature this way (spec 100, M6; ADR-003).
 */

import { batch, createSignal } from "solid-js"
import type { FeedEvent } from "../../utils/feed"
import { emptyFeed, type CommitFileSummary, type FeedState } from "./types"

export type ActivityFeedState = ReturnType<typeof createFeedState>

export function createFeedState() {
  const initial = emptyFeed()
  const [highlightIndex, setHighlightIndex] = createSignal(initial.highlightIndex)
  const [types, setTypes] = createSignal(initial.types)
  const [filter, setFilterValue] = createSignal(initial.filter)
  const [filterInput, setFilterInput] = createSignal(initial.filterInput)
  const [expandedIds, setExpandedIds] = createSignal(initial.expandedIds)
  const [unseenOnly, setUnseenOnly] = createSignal(initial.unseenOnly)
  const [events, setEventsValue] = createSignal(initial.events)
  const [loading, setLoading] = createSignal(initial.loading)
  const [commitFiles, setCommitFilesValue] = createSignal(initial.commitFiles)

  const snapshot = (): FeedState => ({
    highlightIndex: highlightIndex(),
    types: types(),
    filter: filter(),
    filterInput: filterInput(),
    expandedIds: expandedIds(),
    unseenOnly: unseenOnly(),
    events: events(),
    loading: loading(),
    commitFiles: commitFiles(),
  })

  return {
    highlightIndex,
    /** Empty means every type — the `[0] all` the header advertises. */
    types,
    filter,
    filterInput,
    expandedIds,
    unseenOnly,
    events,
    loading,
    commitFiles,
    /** For the pure readers and the drawing, which take a FeedState. */
    snapshot,
    /** Clamped to the rows on screen, which only the caller can count. */
    move(delta: number, rowCount: number) {
      const max = Math.max(0, rowCount - 1)
      setHighlightIndex(Math.max(0, Math.min(max, highlightIndex() + delta)))
    },
    highlight(index: number) {
      setHighlightIndex(index)
    },
    /** A row of types with none selected means all of them, which is what `0` returns to. */
    toggleType(type: string) {
      const next = new Set(types())
      if (next.has(type)) next.delete(type)
      else next.add(type)
      batch(() => {
        setTypes(next)
        setHighlightIndex(0)
      })
    },
    /** Everything again: every type, seen or not, no text. */
    showAll() {
      batch(() => {
        setTypes(new Set<string>())
        setUnseenOnly(false)
        setFilterValue("")
        setFilterInput(false)
        setHighlightIndex(0)
      })
    },
    toggleUnseen() {
      batch(() => {
        setUnseenOnly(!unseenOnly())
        setHighlightIndex(0)
      })
    },
    toggleExpanded(id: string) {
      const next = new Set(expandedIds())
      if (next.has(id)) next.delete(id)
      else next.add(id)
      setExpandedIds(next)
    },
    startLoading() {
      setLoading(true)
    },
    setEvents(next: readonly FeedEvent[]) {
      batch(() => {
        setEventsValue(next)
        setLoading(false)
      })
    },
    setCommitFiles(sha: string, files: CommitFileSummary[]) {
      const next = new Map(commitFiles())
      next.set(sha, files)
      setCommitFilesValue(next)
    },
    startFilter() {
      setFilterInput(true)
    },
    setFilter(value: string) {
      batch(() => {
        setFilterValue(value)
        setHighlightIndex(0)
      })
    },
    /** Enter: keep what the filter left and hand navigation back. */
    commitFilter() {
      setFilterInput(false)
    },
    clearFilter() {
      batch(() => {
        setFilterValue("")
        setFilterInput(false)
      })
    },
    /** A refresh refetches the stream; where the reader stood and what they narrowed to stay. */
    forgetStream() {
      batch(() => {
        setEventsValue([])
        setCommitFilesValue(new Map())
      })
    },
    /** Another review: nothing of this one's feed applies there. */
    reset() {
      const next = emptyFeed()
      batch(() => {
        setHighlightIndex(next.highlightIndex)
        setTypes(next.types)
        setFilterValue(next.filter)
        setFilterInput(next.filterInput)
        setExpandedIds(next.expandedIds)
        setUnseenOnly(next.unseenOnly)
        setEventsValue(next.events)
        setLoading(next.loading)
        setCommitFilesValue(next.commitFiles)
      })
    },
  }
}
