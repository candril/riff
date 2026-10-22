import type { AppState } from "../../state"
import type { Jump, JumpList } from "./types"
import { sameLine } from "./place"

const MAX_ENTRIES = 100

/** What decides whether an entry can be landed on. */
export type Reach = Pick<AppState, "files" | "viewingCommit">

export type Step = { list: JumpList; jump: Jump }

/**
 * Push a jump entry, as nvim does with its default `jumpoptions`: the
 * entries ahead of the index stay, since going back to look at something is
 * no reason to lose where you had been. A line appears once — the older
 * entry for it goes — so walking back never visits the same line twice.
 * Every jump puts the index one past the newest entry, where nvim's is
 * after a jump: the place you are now is not in the list until `Ctrl-o`
 * leaves it.
 */
export function pushJump(list: JumpList, jump: Jump): JumpList {
  const kept = list.entries.filter((entry) => !sameLine(entry, jump))
  kept.push(jump)
  const capped = kept.length > MAX_ENTRIES ? kept.slice(kept.length - MAX_ENTRIES) : kept
  return { entries: capped, index: capped.length }
}

/**
 * An entry whose file left the diff has nowhere to land, so the walk goes
 * past it — but it stays, as nvim keeps an entry for a deleted buffer: a
 * refresh can bring the file back. An entry in another commit is judged
 * by that commit's files once it is switched to, not by these.
 */
function reachable(reach: Reach, jump: Jump): boolean {
  if (jump.viewingCommit !== reach.viewingCommit) return true
  const file = jump.anchor?.filename ?? jump.filename
  return file === null || reach.files.some((f) => f.filename === file)
}

/** The next entry from `from` in `direction` that can be landed on. */
function nextReachable(list: JumpList, reach: Reach, from: number, direction: 1 | -1): number | null {
  const { entries } = list
  for (let i = from + direction; i >= 0 && i < entries.length; i += direction) {
    if (reachable(reach, entries[i]!)) return i
  }
  return null
}

/**
 * One entry back, or null when there is none to land on. `here` is only
 * asked for past the newest entry. On null the caller keeps the list it had,
 * so where you are is not recorded when there is nowhere to go back to.
 */
export function stepBack(list: JumpList, reach: Reach, here: () => Jump): Step | null {
  if (list.entries.length === 0) return null

  // Past the newest entry, where you are is not in the list yet: nvim
  // records it first, so `Ctrl-i` has somewhere to come back to. On an
  // entry, `Ctrl-i` brought you there and the place is already in the list,
  // however far plain motions have moved the cursor since.
  const pastEnd = list.index >= list.entries.length
  const working = pastEnd ? pushJump(list, here()) : list
  const from = pastEnd ? working.entries.length - 1 : working.index

  const index = nextReachable(working, reach, from, -1)
  if (index === null) return null
  return { list: { ...working, index }, jump: working.entries[index]! }
}

/** One entry forward, or null when there is none to land on. */
export function stepForward(list: JumpList, reach: Reach): Step | null {
  const index = nextReachable(list, reach, list.index, 1)
  if (index === null) return null
  return { list: { ...list, index }, jump: list.entries[index]! }
}
