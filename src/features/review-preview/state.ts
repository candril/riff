/**
 * Submit Review's state. The feature owns it rather than AppState, which
 * sheds one slice per feature this way (spec 100, M6; ADR-003).
 */

import { batch, createSignal } from "solid-js"
import type { ReviewEvent } from "../../components/review-preview-model"

export type ReviewPreviewSection = "input" | "comments"

export interface ReviewPreviewSnapshot {
  selectedEvent: ReviewEvent
  loading: boolean
  error: string | undefined
  /** Mirrored from the island's summary textarea as it is typed into. */
  body: string
  excludedCommentIds: ReadonlySet<string>
  highlightedIndex: number
  focusedSection: ReviewPreviewSection
}

export type ReviewPreviewState = ReturnType<typeof createReviewPreviewState>

export function createReviewPreviewState() {
  const [open, setOpen] = createSignal(false)
  const [selectedEvent, setSelectedEvent] = createSignal<ReviewEvent>("COMMENT")
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | undefined>(undefined)
  const [body, setBody] = createSignal("")
  const [excludedCommentIds, setExcludedCommentIds] = createSignal<ReadonlySet<string>>(new Set())
  const [highlightedIndex, setHighlightedIndex] = createSignal(0)
  const [focusedSection, setFocusedSection] = createSignal<ReviewPreviewSection>("comments")

  return {
    open,
    selectedEvent,
    loading,
    error,
    body,
    excludedCommentIds,
    highlightedIndex,
    focusedSection,
    snapshot(): ReviewPreviewSnapshot {
      return {
        selectedEvent: selectedEvent(),
        loading: loading(),
        error: error(),
        body: body(),
        excludedCommentIds: excludedCommentIds(),
        highlightedIndex: highlightedIndex(),
        focusedSection: focusedSection(),
      }
    },
    show() {
      batch(() => {
        setOpen(true)
        setSelectedEvent("COMMENT")
        setLoading(false)
        setError(undefined)
        setBody("")
        setExcludedCommentIds(new Set<string>())
        setHighlightedIndex(0)
        setFocusedSection("comments")
      })
    },
    close() {
      batch(() => {
        setOpen(false)
        setLoading(false)
        setError(undefined)
      })
    },
    startSubmit() {
      setLoading(true)
    },
    fail(message: string) {
      batch(() => {
        setError(message)
        setLoading(false)
      })
    },
    setEvent(event: ReviewEvent) {
      setSelectedEvent(event)
    },
    toggleComment(id: string) {
      const next = new Set(excludedCommentIds())
      if (next.has(id)) next.delete(id)
      else next.add(id)
      setExcludedCommentIds(next)
    },
    moveHighlight(delta: number, maxIndex: number) {
      setHighlightedIndex(Math.max(0, Math.min(maxIndex, highlightedIndex() + delta)))
    },
    toggleSection() {
      setFocusedSection(focusedSection() === "input" ? "comments" : "input")
    },
    setBody(next: string) {
      setBody(next)
    },
  }
}
