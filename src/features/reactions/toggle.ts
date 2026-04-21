/**
 * Reaction toggle (spec 042).
 *
 * Applies an optimistic state update, fires the REST mutation, and rolls
 * back on failure. Toasts on error; silent on success — the reaction row
 * the user toggled from already reflects the new state.
 */

import type { AppState } from "../../state"
import {
  applyReactionToggle,
  getReactionsForTarget,
  showToast,
  clearToast,
} from "../../state"
import type { ReactionContent, ReactionTarget } from "../../types"
import { addReaction, removeReaction } from "../../providers/github"

export interface ReactionsContext {
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
}

/**
 * Toggle a reaction on the given target. Decides add-vs-remove from the
 * current state (so the caller only needs to pass the content).
 */
export async function toggleReaction(
  ctx: ReactionsContext,
  target: ReactionTarget,
  content: ReactionContent,
): Promise<void> {
  const state = ctx.getState()
  if (!state.prInfo) return  // Reactions are PR-only.

  const { owner, repo } = state.prInfo
  const current = getReactionsForTarget(state, target)
  const existing = current.find(r => r.content === content)
  const wasReacted = existing?.viewerHasReacted ?? false
  const cachedReactionId = existing?.viewerReactionId
  const nextReacted = !wasReacted

  // Optimistic flip. We pass `reactionId: undefined` on the optimistic
  // step; if it's an add and succeeds, we re-apply with the real id so
  // a later remove can skip the lookup.
  ctx.setState(s => applyReactionToggle(s, target, content, nextReacted, undefined))
  ctx.render()

  try {
    if (nextReacted) {
      const result = await addReaction(target, content, owner, repo)
      if (!result.success) {
        rollback(ctx, target, content, wasReacted, cachedReactionId, result.error)
        return
      }
      if (result.reactionId !== undefined) {
        ctx.setState(s =>
          applyReactionToggle(s, target, content, true, result.reactionId)
        )
      }
    } else {
      const result = await removeReaction(target, content, owner, repo, cachedReactionId)
      if (!result.success) {
        rollback(ctx, target, content, wasReacted, cachedReactionId, result.error)
        return
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    rollback(ctx, target, content, wasReacted, cachedReactionId, msg)
  }
}

function rollback(
  ctx: ReactionsContext,
  target: ReactionTarget,
  content: ReactionContent,
  wasReacted: boolean,
  reactionId: number | undefined,
  error: string | undefined,
): void {
  ctx.setState(s =>
    showToast(
      applyReactionToggle(s, target, content, wasReacted, reactionId),
      `Reaction failed: ${error ?? "unknown error"}`,
      "error",
    ),
  )
  ctx.render()
  setTimeout(() => {
    ctx.setState(clearToast)
    ctx.render()
  }, 3000)
}
