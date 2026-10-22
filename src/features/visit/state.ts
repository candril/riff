/**
 * The visit's state (spec 069): the watermark of the last time this PR was
 * open, and what this look at it has turned up since. The feature owns it
 * rather than AppState, which sheds one slice per feature this way (spec
 * 100, M6; ADR-003). It knows nothing of where the watermark is stored: the
 * callers that leave or refresh the review write it.
 */

import { batch, createSignal } from "solid-js"
import type { VisitWatermark } from "../../utils/visit"

export type VisitState = ReturnType<typeof createVisitState>

export function createVisitState() {
  const [watermark, setWatermark] = createSignal<VisitWatermark | null>(null)
  const [seen, setSeen] = createSignal<ReadonlySet<string>>(new Set<string>())
  const [rebased, setRebased] = createSignal(false)
  const [changedFiles, setChangedFilesValue] = createSignal<ReadonlySet<string>>(new Set<string>())

  const begin = (next: VisitWatermark | null, wasRebased: boolean) => {
    batch(() => {
      setWatermark(next)
      setRebased(wasRebased)
      setSeen(new Set<string>())
      setChangedFilesValue(new Set<string>())
    })
  }

  return {
    /** Null in local mode and on a first visit: there is nothing to compare against, so nothing is new. */
    watermark,
    /** What has been on screen in this session, written into the next watermark when riff leaves. */
    seen,
    /** The branch was rewritten since the last visit, so riff says so rather than count commits. */
    rebased,
    /** The files whose content moved between the watermark's head and this one. */
    changedFiles,
    /** Without a watermark nothing can be new, so nothing needs remembering as seen. */
    markSeen(ids: readonly string[]) {
      const current = watermark() ? seen() : null
      if (!current || ids.every((id) => current.has(id))) return
      setSeen(new Set([...current, ...ids]))
    },
    setChangedFiles(files: ReadonlySet<string>) {
      setChangedFilesValue(files)
    },
    /** A new look at the review: what the last one saw and found changed belongs to it. */
    begin,
    /** Another review, which has no visit of its own until riff loads one. */
    reset() {
      begin(null, false)
    },
  }
}
