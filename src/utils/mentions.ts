/**
 * Mention candidates — derive the unique set of GitHub usernames the
 * user might want to @-mention in a comment, drawn from the loaded PR
 * data and existing comments. We don't hit the GitHub API at typing
 * time; everything here is data we already have in `AppState`.
 *
 * Order: PR author first, then requested reviewers, then review
 * authors, then conversation/review comment authors. Highest-signal
 * names appear first when the query is empty.
 */

import type { AppState } from "../state"

const MENTION_TRIGGER_RE = /(?:^|\s)@([A-Za-z0-9-]*)$/

export function collectMentionCandidates(state: AppState): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const push = (name: string | undefined | null) => {
    if (!name) return
    const trimmed = name.trim()
    if (!trimmed || trimmed === "you") return
    if (seen.has(trimmed)) return
    seen.add(trimmed)
    out.push(trimmed)
  }

  const pr = state.prInfo
  if (pr) {
    push(pr.author)
    pr.requestedReviewers?.forEach(push)
    pr.reviews?.forEach((r) => push(r.author))
    pr.conversationComments?.forEach((c) => push(c.author))
  }
  state.comments.forEach((c) => push(c.author))
  return out
}

/**
 * Detect whether the text immediately preceding `cursorOffset` is an
 * active `@mention` trigger — i.e. an `@` that either starts the input
 * or follows whitespace, with only word characters typed since.
 *
 * Returns the query (text after `@`) and the absolute offset of the
 * `@` itself, so the caller can replace `@<query>` with the chosen
 * username on accept. Returns null when no trigger is active.
 */
export function detectMentionTrigger(
  text: string,
  cursorOffset: number
): { query: string; atOffset: number } | null {
  if (cursorOffset < 1 || cursorOffset > text.length) return null
  const slice = text.slice(0, cursorOffset)
  const match = slice.match(MENTION_TRIGGER_RE)
  if (!match) return null
  const query = match[1] ?? ""
  // `@` lives just before the captured query.
  const atOffset = cursorOffset - query.length - 1
  return { query, atOffset }
}
