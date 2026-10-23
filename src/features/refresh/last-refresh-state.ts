/**
 * When riff last confirmed the review current, as an ISO timestamp: the
 * header's `↻ HH:MM`. It says how fresh the review is, not what the review
 * holds, so the feature owns it rather than AppState (spec 100, M6;
 * ADR-003). A reload, a switch to another PR and every successful poll tick
 * stamp it; a failed one leaves the last good time standing.
 */

import { createSignal } from "solid-js"

export type LastRefreshState = ReturnType<typeof createLastRefreshState>

export function createLastRefreshState(clock: () => string = () => new Date().toISOString()) {
  const [at, setAt] = createSignal(clock())

  return {
    at,
    stamp() {
      setAt(clock())
    },
  }
}
