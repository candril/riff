/**
 * Mention candidates — the unique set of handles the user might want to
 * @-mention in a comment, assembled from three sources and offered in
 * descending order of how likely they are to be the one you want:
 *
 *   1. PR participants derived from `AppState` — author, requested
 *      reviewers, review and comment authors. Instant and offline.
 *   2. `mentions.extra` from the config — teams (`org/team`) and bots that
 *      the GitHub user query below can't return.
 *   3. The repo's mentionable users, fetched in the background (spec 046).
 *      Complete, but it only shows up once the fetch lands.
 *
 * Nothing here blocks: this runs synchronously on every render, so the
 * fetched pool arrives via `state.mentionableUsers` rather than an await.
 */

import type { AppState } from "../state"
import { loadConfig } from "../config"

// Team handles contain a slash (`org/team`), so the trigger has to survive
// one — otherwise typing past it silently dismisses the picker.
const MENTION_TRIGGER_RE = /(?:^|\s)@([A-Za-z0-9\-/]*)$/

/**
 * Config extras, read once. `collectMentionCandidates` runs on every render,
 * and `loadConfig` re-reads the TOML from disk on every call.
 */
let extras: string[] | null = null
function configuredExtras(): string[] {
  extras ??= loadConfig().mentions.extra
  return extras
}

export function collectMentionCandidates(state: AppState): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const push = (name: string | undefined | null) => {
    if (!name) return
    const trimmed = name.trim()
    if (!trimmed || trimmed === "you") return
    // GitHub handles are case-insensitive, so dedupe on a folded key while
    // keeping the first spelling we saw (the PR data's, which is canonical).
    const key = trimmed.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
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
  configuredExtras().forEach(push)
  state.mentionableUsers.forEach(push)
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
