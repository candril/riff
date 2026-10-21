import type { PromptSession } from "./prompt-session"

/** Every island that draws a prompt, named by the first `:` segment of its prompts' keys. */
export const promptOwners = [
  "search",
  "file-picker",
  "comments-picker",
  "marks-picker",
  "occurrence-picker",
  "commit-picker",
  "action-menu",
  "feed-filter",
  "comments-filter",
] as const

export type PromptOwner = (typeof promptOwners)[number]

/** Typed so a prompt cannot open under an owner no island answers to. */
export type PromptKey = PromptOwner | `${PromptOwner}:${string}`

export interface PromptIsland {
  prompt(session: PromptSession | null): void
}

export function ownerOf(key: PromptKey): PromptOwner {
  return key.split(":")[0] as PromptOwner
}

/**
 * Hands the open prompt's session to the island that owns it, and closes
 * every other island's first: one field types at a time, and the field
 * that had the keys lets go of them before the next one takes them.
 */
export function routePrompt(
  islands: Record<PromptOwner, PromptIsland>,
  session: (PromptSession & { key: PromptKey }) | null
): void {
  const owner = session ? ownerOf(session.key) : null
  for (const other of promptOwners) if (other !== owner) islands[other].prompt(null)
  if (session && owner) islands[owner].prompt(session)
}

type PromptFrameIslands = Record<
  "searchPrompt" | "filePicker" | "commentsPicker" | "marksPicker" | "occurrencePicker" | "commitPicker" | "actionMenu",
  PromptIsland
>

export function promptIslandsOf(
  islands: PromptFrameIslands,
  feed: PromptIsland,
  threadPanel: PromptIsland
): Record<PromptOwner, PromptIsland> {
  return {
    search: islands.searchPrompt,
    "file-picker": islands.filePicker,
    "comments-picker": islands.commentsPicker,
    "marks-picker": islands.marksPicker,
    "occurrence-picker": islands.occurrencePicker,
    "commit-picker": islands.commitPicker,
    "action-menu": islands.actionMenu,
    "feed-filter": feed,
    "comments-filter": threadPanel,
  }
}
