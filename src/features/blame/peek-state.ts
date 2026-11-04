/**
 * The `gB` blame peek's state. The feature owns it rather than AppState,
 * which sheds one slice per feature this way (spec 100, M6; ADR-003).
 */

import { createSignal } from "solid-js"
import type { BlamePeekStatus } from "../../components/blame-peek-model"
import type { LineBlame } from "../../providers/blame/source"
import type { BlameTarget } from "./target"

/** `gB`'s peek: the line it blames and what is known about it so far. */
export type BlamePeekSnapshot = { target: BlameTarget; request: number } & BlamePeekStatus

export type BlameOutcome = { result: LineBlame | null } | { message: string }

export type BlamePeekState = ReturnType<typeof createBlamePeekState>

export function createBlamePeekState() {
  const [peek, setPeek] = createSignal<BlamePeekSnapshot | null>(null)
  // Never reset, so an answer for a peek already closed can never match a later one.
  let lastRequest = 0

  return {
    peek,
    open: () => peek() !== null,
    /** Starts a peek on `target`, loading, and returns the request its answer must name. */
    show(target: BlameTarget): number {
      const request = ++lastRequest
      setPeek({ target, request, status: "loading" })
      return request
    },
    /**
     * An answer for a request the peek no longer shows is dropped: a slow read for
     * a peek closed and reopened on another line would otherwise name the wrong commit.
     */
    settle(request: number, outcome: BlameOutcome) {
      const current = peek()
      if (!current || current.request !== request) return
      setPeek(
        "message" in outcome
          ? { target: current.target, request, status: "error", message: outcome.message }
          : { target: current.target, request, status: "ready", result: outcome.result },
      )
    },
    close() {
      if (peek() !== null) setPeek(null)
    },
  }
}
