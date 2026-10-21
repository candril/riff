import { $ } from "bun"
import { extractShellError, getCurrentUser } from "./exec"
import type { ReactionContent, ReactionSummary, ReactionTarget } from "../../types"
import { REACTION_CONTENT } from "../../types"

/**
 * Raw reactionGroups node as returned by GitHub GraphQL.
 */
export interface RawReactionGroup {
  content: string
  viewerHasReacted: boolean
  reactors: { totalCount: number }
}

/**
 * GraphQL names a reaction `THUMBS_UP`; REST — and riff, and the add/remove
 * mutations — call it `+1`. Reading the one as the other silently dropped
 * every reaction riff ever loaded, while posting them kept working.
 */
const REACTION_BY_GRAPHQL_NAME: Record<string, ReactionContent> = {
  THUMBS_UP: "+1",
  THUMBS_DOWN: "-1",
  LAUGH: "laugh",
  CONFUSED: "confused",
  HEART: "heart",
  HOORAY: "hooray",
  ROCKET: "rocket",
  EYES: "eyes",
}

/**
 * Convert GitHub's GraphQL reactionGroups array into riff's ReactionSummary[].
 * Drops unknown content values (future GitHub additions) and zero-count groups
 * — the palette submenu fabricates rows for the full 8-reaction set anyway,
 * so we only carry non-empty state.
 */
export function parseReactionGroups(groups: RawReactionGroup[] | undefined): ReactionSummary[] {
  if (!groups) return []
  const known = new Set<string>(REACTION_CONTENT)
  const out: ReactionSummary[] = []
  for (const raw of groups) {
    // Accept either spelling: the bundle asks GraphQL, and REST answers
    // elsewhere with the same shape.
    const content = REACTION_BY_GRAPHQL_NAME[raw.content] ?? raw.content
    const g = { ...raw, content }
    if (!known.has(g.content)) continue
    const count = g.reactors?.totalCount ?? 0
    if (count === 0 && !g.viewerHasReacted) continue
    out.push({
      content: g.content as ReactionContent,
      count,
      viewerHasReacted: Boolean(g.viewerHasReacted),
    })
  }
  return out
}

export interface AddReactionResult {
  success: boolean
  reactionId?: number
  error?: string
}

export interface RemoveReactionResult {
  success: boolean
  error?: string
}

/**
 * Build the REST path for a reaction target. All four reactable surfaces
 * mount reactions at `<target>/reactions`; POST creates, DELETE at
 * `<target>/reactions/<id>` removes.
 */
function reactionPath(
  target: ReactionTarget,
  owner: string,
  repo: string,
): string {
  switch (target.kind) {
    case "review-comment":
      return `repos/${owner}/${repo}/pulls/comments/${target.githubId}/reactions`
    case "issue-comment":
      return `repos/${owner}/${repo}/issues/comments/${target.githubId}/reactions`
    case "review":
      return `repos/${owner}/${repo}/pulls/${target.prNumber}/reviews/${target.reviewId}/reactions`
    case "issue":
      return `repos/${owner}/${repo}/issues/${target.prNumber}/reactions`
  }
}

/**
 * Add a reaction to a PR-side entity. Returns the new reaction's REST id
 * so callers can stash it for fast removal later (spec 042).
 */
export async function addReaction(
  target: ReactionTarget,
  content: ReactionContent,
  owner: string,
  repo: string,
): Promise<AddReactionResult> {
  try {
    const path = reactionPath(target, owner, repo)
    const result = await $`gh api -X POST ${path} -f content=${content}`.json() as { id: number }
    return { success: true, reactionId: result.id }
  } catch (err) {
    return { success: false, error: extractShellError(err) }
  }
}

/**
 * Remove a reaction. If `reactionId` is known (e.g. stashed from a prior
 * add in this session), we DELETE it directly. If it isn't — the viewer
 * reacted before riff was loaded and we only know they reacted, not the
 * reaction id — list the reactions on the target, find the viewer's, and
 * delete that one. Two round-trips for this rarer case.
 */
export async function removeReaction(
  target: ReactionTarget,
  content: ReactionContent,
  owner: string,
  repo: string,
  reactionId: number | undefined,
): Promise<RemoveReactionResult> {
  try {
    const basePath = reactionPath(target, owner, repo)
    let id = reactionId
    if (id === undefined) {
      const currentUser = await getCurrentUser()
      const reactions = await $`gh api --paginate ${basePath}?content=${content}`.json() as Array<{
        id: number
        content: string
        user?: { login?: string }
      }>
      const mine = reactions.find(r => r.content === content && r.user?.login === currentUser)
      if (!mine) {
        // Nothing to delete — treat as success so the optimistic UI
        // stays consistent with the real server state.
        return { success: true }
      }
      id = mine.id
    }
    await $`gh api -X DELETE ${basePath}/${id}`.quiet()
    return { success: true }
  } catch (err) {
    return { success: false, error: extractShellError(err) }
  }
}
