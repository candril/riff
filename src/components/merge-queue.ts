/**
 * The merge status's Queue line (spec 108): where the PR stands in its base
 * branch's merge queue, or why it left it. Kept apart from the gates, since
 * the queue is no gate: it takes over once the gates let the PR in.
 */

import type { PrMergeQueue, PrMergeQueueEntry } from "../providers/github/types"
import { timeAgo } from "./feed-model"
import type { MergePoint } from "./merge-status-model"

const STATE_WORDS: Record<PrMergeQueueEntry["state"], string> = {
  QUEUED: "queued",
  AWAITING_CHECKS: "awaiting checks",
  LOCKED: "locked",
  MERGEABLE: "mergeable",
  UNMERGEABLE: "unmergeable",
}

export function queuePoint(
  queue: PrMergeQueue | null | undefined,
  { ready, now }: { ready: boolean; now: number }
): MergePoint | null {
  if (!queue) return null
  const { entry, removal } = queue
  if (entry?.state === "UNMERGEABLE") return { id: "queue", state: "fail", text: "unmergeable" }
  if (entry) {
    const parts = [
      positionText(entry),
      STATE_WORDS[entry.state],
      entry.etaSeconds === null ? null : formatEta(entry.etaSeconds),
      addedText(entry, now),
    ]
    return {
      id: "queue",
      state: entry.state === "MERGEABLE" ? "merging" : "queued",
      text: parts.filter((part) => part).join(" · "),
    }
  }
  if (removal) {
    const reason = removal.reason.toLowerCase()
    return { id: "queue", state: "fail", text: reason ? `removed · ${reason}` : "removed" }
  }
  return { id: "queue", state: "idle", text: ready ? "not queued · merging adds it" : "not queued" }
}

/** `#3 of 7`, or `#3` when GitHub does not say how long the queue is. */
export function positionText({ position, total }: Pick<PrMergeQueueEntry, "position" | "total">): string {
  return total === null ? `#${position}` : `#${position} of ${total}`
}

/** Rounded up, so a merge due in seconds never reads as `~0m`. */
export function formatEta(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60))
  if (minutes < 60) return `~${minutes}m`
  const rest = minutes % 60
  return rest === 0 ? `~${Math.floor(minutes / 60)}h` : `~${Math.floor(minutes / 60)}h ${rest}m`
}

function addedText({ enqueuer, enqueuedAt }: PrMergeQueueEntry, now: number): string | null {
  const time = enqueuedAt === null ? "" : timeAgo(enqueuedAt, now)
  const when = time === "" ? null : time === "now" ? "just now" : `${time} ago`
  if (enqueuer === null) return when === null ? null : `added ${when}`
  return when === null ? `added by ${enqueuer}` : `added by ${enqueuer} ${when}`
}
