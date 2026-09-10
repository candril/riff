/**
 * Resolve the pull requests and issues the loaded comments point at (spec 059).
 *
 * Best-effort and silent, like the mention roster: the panels render from the
 * cache on every frame, so answers have to land in it and trigger a redraw
 * rather than be waited for, and a failed call just leaves `#412` reading as
 * `#412`.
 */

import type { AppState } from "../../state"
import type { PrInfo } from "../../providers/github"
import { getReferenceTitles } from "../../providers/github"
import { getCurrentRepoInfo } from "../../storage"
import { findReferences, referenceKey, type Repo } from "../../utils/references"
import {
  markAsked,
  referenceRepo,
  rememberReferences,
  setReferenceRepo,
  unasked,
} from "./store"

export interface ReferencePrefetchContext {
  getState: () => AppState
  render: () => void
  mode: "local" | "pr"
  prInfo: PrInfo | null
}

/** Kick off a pass. Returns immediately; titles appear when they land. */
export function startReferencePrefetch(ctx: ReferencePrefetchContext): void {
  void resolve(ctx).catch(() => {
    // Nothing to recover: references stay as they were written.
  })
}

async function resolve(ctx: ReferencePrefetchContext): Promise<void> {
  const repo = referenceRepo() ?? (await resolveRepo(ctx))
  if (!repo) return
  setReferenceRepo(repo)

  const keys = unasked(collect(ctx.getState(), repo))
  if (keys.length === 0) return
  markAsked(keys)

  const answers = await getReferenceTitles(keys)
  if (answers.size === 0) return

  rememberReferences(answers)
  ctx.render()
}

/**
 * Every reference in what is on screen or one keypress from it: the PR's own
 * description, and every comment body — including a local edit, which is what
 * the author is looking at while they write it.
 */
function collect(state: AppState, repo: Repo): string[] {
  const bodies = [state.prInfo?.body ?? ""]
  for (const comment of state.comments) {
    bodies.push(comment.body)
    if (comment.localEdit !== undefined) bodies.push(comment.localEdit)
  }

  const keys = new Set<string>()
  for (const body of bodies) {
    if (!body) continue
    for (const reference of findReferences(body)) {
      const key = referenceKey(reference, repo)
      if (key) keys.add(key)
    }
  }
  return [...keys]
}

/**
 * Which repo a bare `#412` belongs to. In PR mode that is the base repo —
 * where the PR lives and where GitHub itself resolves the number — and in
 * local mode whatever repo the working directory is in.
 */
async function resolveRepo(ctx: ReferencePrefetchContext): Promise<Repo | null> {
  if (ctx.mode === "pr" && ctx.prInfo) {
    return { owner: ctx.prInfo.owner, repo: ctx.prInfo.repo }
  }
  return getCurrentRepoInfo()
}
