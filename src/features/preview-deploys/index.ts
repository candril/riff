/**
 * Deploying a preview on demand, and following one while it builds
 * (spec 113).
 *
 * The deploy bot's interface is a task list under its table: ticking
 * `- [ ] Deploy 🖼️ Demo Studio preview` is the button. riff presses it the
 * way GitHub's own checkbox does, by rewriting that one line of the
 * comment, then watches the comment until nothing on it is pending.
 */

import type { ConfirmState } from "../confirm/state"
import type { ToastState } from "../toast/state"
import type { IssueCommentSnapshot, RunJob } from "../../providers/github/lookups"
import type { LinkSource, LinkTarget } from "../../utils/link-targets"
import {
  isPending,
  previewState,
  runIdOf,
  tickDeployTask,
  type PreviewRow,
  type PreviewSet,
} from "../../utils/previews"

export interface PreviewDeploysApi {
  fetchComment: (owner: string, repo: string, commentId: number) => Promise<IssueCommentSnapshot>
  updateComment: (
    owner: string,
    repo: string,
    commentId: number,
    body: string,
  ) => Promise<{ success: boolean; error?: string }>
  fetchRunJobs: (owner: string, repo: string, runId: string) => Promise<RunJob[]>
}

export interface PreviewDeploysDeps {
  /** The PR's repo and the previews riff found in it; null outside a PR. */
  target: () => { owner: string; repo: string; previews: PreviewSet | null } | null
  confirm: Pick<ConfirmState, "show" | "close">
  toast: Pick<ToastState, "show" | "clear">
  render: () => void
  /** Puts a fresh copy of the bot's comment into the PR, so the previews are read again. */
  applyComment: (commentId: string, body: string) => void
  openUrl: (url: string) => void
  api: PreviewDeploysApi
  /** How often a pending row is checked; 15 s by default. */
  intervalMs?: number
  setInterval?: (run: () => void, ms: number) => unknown
  clearInterval?: (handle: unknown) => void
}

export type PreviewDeploys = ReturnType<typeof createPreviewDeploys>

const DEFAULT_INTERVAL_MS = 15_000
const TOAST_MS = 3000

export function createPreviewDeploys(deps: PreviewDeploysDeps) {
  const every = deps.setInterval ?? ((run, ms) => {
    const handle = setInterval(run, ms)
    // A watch must never be what keeps riff from exiting.
    ;(handle as { unref?: () => void }).unref?.()
    return handle
  })
  const cancel = deps.clearInterval ?? ((handle) => clearInterval(handle as ReturnType<typeof setInterval>))
  let timer: unknown = null
  let inFlight = false

  function flash(message: string, type: "success" | "error" | "info"): void {
    deps.toast.show(message, type)
    deps.render()
    setTimeout(() => {
      deps.toast.clear()
      deps.render()
    }, TOAST_MS)
  }

  function pending(): boolean {
    return deps.target()?.previews?.rows.some(isPending) ?? false
  }

  async function check(): Promise<void> {
    const target = deps.target()
    const previews = target?.previews
    if (!target || !previews || inFlight) return
    inFlight = true
    try {
      const fresh = await deps.api.fetchComment(target.owner, target.repo, Number(previews.commentId))
      deps.applyComment(previews.commentId, fresh.body)
      deps.render()
    } catch {
      // A missed check is made up by the next one; the toast would only nag.
    } finally {
      inFlight = false
    }
    if (!pending()) stop()
  }

  /** Check the bot's comment until no row on it is building or waiting to deploy. */
  function watch(): void {
    if (timer !== null || !pending()) return
    timer = every(() => void check(), deps.intervalMs ?? DEFAULT_INTERVAL_MS)
  }

  function stop(): void {
    if (timer === null) return
    cancel(timer)
    timer = null
  }

  async function tick(row: PreviewRow): Promise<void> {
    const target = deps.target()
    const previews = target?.previews
    const line = row.deploy?.line
    if (!target || !previews || !line) return
    const commentId = Number(previews.commentId)

    // The bot rewrites this comment as it works; only a copy read just now
    // is safe to write back.
    const fresh = await deps.api.fetchComment(target.owner, target.repo, commentId).catch(() => null)
    if (!fresh) {
      flash("Could not read the preview comment", "error")
      return
    }
    const next = tickDeployTask(fresh.body, line)
    if (!next) {
      deps.applyComment(previews.commentId, fresh.body)
      flash(`${row.app} is no longer waiting to be deployed`, "info")
      watch()
      return
    }
    const result = await deps.api.updateComment(target.owner, target.repo, commentId, next)
    if (!result.success) {
      flash(`Deploy failed: ${result.error ?? "GitHub refused the edit"}`, "error")
      return
    }
    deps.applyComment(previews.commentId, next)
    flash(`Deploy of ${row.app} requested`, "success")
    watch()
  }

  /** Ask for the row's deploy — after a yes, since it starts work nobody can stop from here. */
  function deploy(row: PreviewRow): void {
    if (previewState(row) !== "deployable") return
    deps.confirm.show({
      title: "Deploy preview",
      message: `Deploy ${row.app}?`,
      details: row.deploy?.line.replace(/^\s*[-*] \[ \] /, ""),
      onConfirm: () => {
        deps.confirm.close()
        deps.render()
        void tick(row)
      },
      onCancel: () => {
        deps.confirm.close()
        deps.render()
      },
    })
    deps.render()
  }

  /** The jobs of the run building the row, unfinished and failed first. */
  async function showBuild(row: PreviewRow, openLinks: (source: LinkSource, title: string) => void): Promise<void> {
    const target = deps.target()
    const runId = runIdOf(row)
    if (!target || !runId) {
      if (row.built?.url) deps.openUrl(row.built.url)
      else flash(`No build linked for ${row.app}`, "info")
      return
    }
    const jobs = await deps.api.fetchRunJobs(target.owner, target.repo, runId).catch(() => null)
    if (!jobs || jobs.length === 0) {
      if (row.built?.url) deps.openUrl(row.built.url)
      return
    }
    openLinks({ title: row.app, links: jobLinks(jobs) }, `Build — ${row.app}`)
  }

  return { deploy, showBuild, watch, stop, check }
}

/** Running, waiting and failed jobs are the ones worth reading; the green ones go last. */
export function jobLinks(jobs: readonly RunJob[]): LinkTarget[] {
  return [...jobs]
    .map((job, index) => ({ job, index, rank: jobRank(job) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ job }) => ({ label: `${jobMark(job)} ${job.name}`, url: job.url, detail: jobState(job) }))
}

function jobRank(job: RunJob): number {
  if (job.status === "in_progress") return 0
  if (job.status !== "completed") return 1
  if (job.conclusion === "failure" || job.conclusion === "timed_out" || job.conclusion === "cancelled") return 2
  return 3
}

function jobMark(job: RunJob): string {
  if (job.status === "in_progress") return "●"
  if (job.status !== "completed") return "○"
  if (job.conclusion === "success") return "✓"
  if (job.conclusion === "skipped" || job.conclusion === "neutral") return "–"
  return "✗"
}

function jobState(job: RunJob): string {
  return job.status === "completed" ? (job.conclusion ?? "completed") : job.status.replace("_", " ")
}
