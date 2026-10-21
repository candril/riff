import type { BlamePeekStatus } from "../../components/blame-peek-model"
import type { LineBlame } from "../../providers/blame/source"
import type { BlameTarget } from "./target"

/** `gb`'s peek: the line it blames and what is known about it so far. */
export type BlamePeekState = { target: BlameTarget; request: number } & BlamePeekStatus

export type BlameOutcome = { result: LineBlame | null } | { message: string }

interface WithBlamePeek {
  blamePeek: BlamePeekState | null
}

export function openBlamePeek<S extends WithBlamePeek>(state: S, target: BlameTarget, request: number): S {
  return { ...state, blamePeek: { target, request, status: "loading" } }
}

/**
 * An answer for a request the peek no longer shows is dropped: a slow read for
 * a peek closed and reopened on another line would otherwise name the wrong commit.
 */
export function settleBlamePeek<S extends WithBlamePeek>(state: S, request: number, outcome: BlameOutcome): S {
  const peek = state.blamePeek
  if (!peek || peek.request !== request) return state
  const settled: BlamePeekState =
    "message" in outcome
      ? { target: peek.target, request, status: "error", message: outcome.message }
      : { target: peek.target, request, status: "ready", result: outcome.result }
  return { ...state, blamePeek: settled }
}

export function closeBlamePeek<S extends WithBlamePeek>(state: S): S {
  return state.blamePeek ? { ...state, blamePeek: null } : state
}
