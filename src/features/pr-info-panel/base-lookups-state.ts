/**
 * What the PR's base lookups last heard: the stack (spec 072) and how far
 * the head is behind its base (spec 108). The feature owns it rather than
 * AppState, which sheds one slice per feature this way (spec 100, M6;
 * ADR-003).
 *
 * Each lookup hands out a ticket per ask and takes an answer only on the
 * latest one, so a slow answer never overwrites the one a newer ask got.
 */

import { batch, createSignal } from "solid-js"
import type { BehindBy } from "../../components/merge-status-model"
import type { StackInfo } from "../../utils/stack"

export type BaseLookupsState = ReturnType<typeof createBaseLookupsState>

export function createBaseLookupsState() {
  const [stack, setStack] = createSignal<StackInfo | null>(null)
  // A null stack is both "not stacked" and "not asked yet"; this tells them
  // apart.
  const [stackHeard, setStackHeard] = createSignal(false)
  const [behindBy, setBehindBy] = createSignal<BehindBy>(null)
  let stackAsks = 0
  let behindByAsks = 0

  return {
    stack,
    stackHeard,
    behindBy,
    /** Drops what was heard, and any answer still out. */
    forget() {
      stackAsks++
      behindByAsks++
      batch(() => {
        setStack(null)
        setStackHeard(false)
        setBehindBy(null)
      })
    },
    askStack(): number {
      return ++stackAsks
    },
    askBehindBy(): number {
      return ++behindByAsks
    },
    answerStack(ticket: number, next: StackInfo | null): boolean {
      if (ticket !== stackAsks) return false
      batch(() => {
        setStack(next)
        setStackHeard(true)
      })
      return true
    },
    answerBehindBy(ticket: number, next: BehindBy): boolean {
      if (ticket !== behindByAsks) return false
      setBehindBy(next)
      return true
    },
  }
}
