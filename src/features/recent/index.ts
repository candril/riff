import type { CliRenderer } from "@opentui/core"
import type { PrInfo } from "../../providers/github/types"
import type { FilesTarget } from "../../providers/files"
import { recentKey, recordClosed, recordOpened, type RecentReview } from "../../storage/recent"

export interface OpenedReview {
  mode?: "local" | "pr"
  target?: string
  filesTarget?: FilesTarget
  prInfo?: PrInfo
  demo?: boolean
}

/** What gets written for a review riff opened; null for one not worth going back to. */
export function recentReviewFor(review: OpenedReview, directory: string, now: Date): RecentReview | null {
  // The demo's fixture is rebuilt in a temporary directory on every run.
  if (review.demo) return null
  const openedAt = now.toISOString()
  if (review.mode === "pr") {
    const pr = review.prInfo
    if (!pr) return null
    return { kind: "pr", url: pr.url, owner: pr.owner, repo: pr.repo, number: pr.number, title: pr.title, directory, openedAt }
  }
  return { kind: "local", target: review.filesTarget?.path ?? review.target ?? null, directory, openedAt }
}

/** Spec 118: the review goes to the top of ~/.riff/recent.json now, and is marked closed when riff quits. */
export function startRecentRecording(renderer: Pick<CliRenderer, "on">, review: OpenedReview): void {
  const entry = recentReviewFor(review, process.cwd(), new Date())
  if (!entry) return
  recordOpened(entry)
  const key = recentKey(entry)
  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    recordClosed(key)
  }
  // quit() ends in process.exit; Ctrl-c and the exit signals only destroy the renderer.
  process.on("exit", close)
  renderer.on("destroy", close)
}
