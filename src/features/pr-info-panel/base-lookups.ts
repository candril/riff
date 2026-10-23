/**
 * The PR's two base lookups: whether it is stacked on another PR (spec 072)
 * and how far its head is behind its base (spec 108). Both are REST calls
 * on load and refresh, never on the poll, so a panel the poll rebuilds
 * starts from what was last heard instead of asking again.
 */

import type { BehindBy } from "../../components/merge-status-model"
import type { StackInfo } from "../../utils/stack"
import type { BaseLookupsState } from "./base-lookups-state"

export interface BaseLookupTarget {
  owner: string
  repo: string
  baseRef: string
  headSha: string
  /** Names the PR, its base and its head, so a change to any of them shows. */
  key: string
}

export interface BaseLookupsPanel {
  setStack(stack: StackInfo | null): void
  setBehindBy(behindBy: BehindBy): void
}

export interface BaseLookupsDeps {
  state: BaseLookupsState
  target(): BaseLookupTarget | null
  fetchStack(owner: string, repo: string, baseRef: string, headSha: string): Promise<StackInfo | null>
  fetchBehindBy(owner: string, repo: string, baseRef: string, headSha: string): Promise<number | "failed">
  panel(): BaseLookupsPanel | null
  onRewritten(stack: StackInfo): void
  render(): void
}

export function createBaseLookups(deps: BaseLookupsDeps) {
  const { state } = deps

  /**
   * An answer lands on whichever panel is up by then, as long as the target
   * still matches: a comment poll can rebuild the panel while a lookup is
   * out, and that rebuild does not ask again.
   */
  async function readStack(): Promise<void> {
    const asked = deps.target()
    if (!asked) return
    const ticket = state.askStack()
    const stack = await deps.fetchStack(asked.owner, asked.repo, asked.baseRef, asked.headSha)
    if (deps.target()?.key !== asked.key) return
    if (!state.answerStack(ticket, stack)) return
    deps.panel()?.setStack(stack)
    // A rewritten base changes what the diff means and is the thing least
    // likely guessed, so it earns a word on opening.
    if (stack?.status === "rewritten") deps.onRewritten(stack)
    deps.render()
  }

  async function readBehindBy(): Promise<void> {
    const asked = deps.target()
    if (!asked) return
    const ticket = state.askBehindBy()
    const behindBy = await deps.fetchBehindBy(asked.owner, asked.repo, asked.baseRef, asked.headSha)
    if (deps.target()?.key !== asked.key) return
    if (!state.answerBehindBy(ticket, behindBy)) return
    deps.panel()?.setBehindBy(behindBy)
    deps.render()
  }

  return {
    state,
    /** For a count riff knows without asking, as after it updated the branch itself. */
    settleBehindBy(next: BehindBy): void {
      state.settle(next)
      deps.panel()?.setBehindBy(next)
    },
    /**
     * Seeds a panel — the first or a replacement — from what was last heard,
     * so a rebuild never draws the lookups as not yet asked; `reread` forgets
     * and asks again.
     */
    wire(panel: BaseLookupsPanel, { reread }: { reread: boolean }): void {
      if (reread) {
        state.forget()
        panel.setBehindBy(null)
        void readStack()
        void readBehindBy()
        return
      }
      panel.setBehindBy(state.behindBy())
      // The panel keeps the stack line's room until it hears, so a null that
      // only means "not asked yet" must not reach it.
      if (state.stack() !== null || state.stackHeard()) panel.setStack(state.stack())
    },
  }
}
