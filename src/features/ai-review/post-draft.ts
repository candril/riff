/**
 * Post a PR review comment that Claude drafted into `draft-comment.json`.
 *
 * Full design in specs/036-ai-review-post-comment.md. Summary:
 *
 * 1. The AI Review chat tells Claude (via the system prompt and the
 *    `/riff-comment` slash command) to save its drafted comment as JSON
 *    to `<contextDir>/draft-comment.json`.
 * 2. A background poller (`startDraftPoller`) ticks every POLL_MS while in
 *    PR mode, checks the draft file's mtime, and on change re-reads +
 *    validates it. Valid drafts populate `state.draftNotification`;
 *    deletions clear it.
 * 3. A persistent `DraftNotification` component (rendered bottom-right,
 *    no auto-dismiss) tells the user a draft is waiting.
 * 4. Interaction paths:
 *      - Direct: `gd` (review) / `gD` (dismiss) chords from anywhere.
 *      - Action menu: "Claude: Review drafted comment" / "Claude:
 *        Dismiss drafted comment".
 * 5. Review opens the bigger `DraftReviewDialog` (spec 036) with four
 *    key bindings:
 *      y (or Enter)  → post via submitSingleComment, delete the file
 *      e             → open $EDITOR on the body, rewrite the JSON,
 *                      re-validate, re-show the dialog
 *      d             → discard (delete the file, clear notification)
 *      n / Esc       → cancel (close dialog, file preserved)
 * 6. On successful post the draft file is deleted; on failure it's
 *    preserved so the user can retry.
 */

import { existsSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import {
  showToast,
  clearToast,
  setDraftNotification,
  clearDraftNotification,
  openDraftReview,
  closeDraftReview,
  type DraftNotificationState,
  type DraftReviewDialogState,
} from "../../state"
import { createComment } from "../../types"
import type { DiffFile } from "../../utils/diff-parser"
import type { PrInfo } from "../../providers/github"
import {
  getPrHeadSha,
  submitSingleComment,
} from "../../providers/github"
import type { AiReviewContext } from "./handlers"
import { draftPathFor } from "./handlers"

const POLL_MS = 1500
const BODY_PREVIEW_CHARS = 140
const EDIT_MARKER = "<!-- Edit the comment above. Lines starting with `<!--` are ignored. Save & quit to update the draft; leave empty to keep original. -->"

/**
 * JSON schema Claude is instructed to emit. `kind` is a tagged-union
 * discriminator so future non-inline kinds (reply / pr-level / etc.) can
 * be added without breaking existing drafts.
 */
export interface DraftCommentFile {
  kind: "inline"
  filename: string
  side: "LEFT" | "RIGHT"
  line: number
  startLine?: number
  body: string
  draftedAt: string
}

// ---------- background poller ----------

/**
 * Start the background draft poller. Non-blocking: returns a `stop`
 * function so callers can tear it down, though `app.ts` doesn't currently
 * need to — the process is short-lived and the `setInterval` lives for the
 * lifetime of the TUI.
 *
 * The poller is a no-op on each tick when not in PR mode, so calling
 * `startDraftPoller` unconditionally from `app.ts` is safe and avoids
 * wiring a mode-change listener.
 */
export function startDraftPoller(ctx: AiReviewContext): () => void {
  let lastMtime: number | null = null
  let lastErroredPath: string | null = null

  const tick = (): void => {
    if (ctx.mode !== "pr" || !ctx.prInfo) return

    const state = ctx.getState()
    const path = draftPathFor({
      mode: ctx.mode,
      prInfo: ctx.prInfo,
      source: state.source,
    })

    // File gone — clear any existing notification.
    let stat: { mtimeMs: number } | null = null
    try {
      stat = statSync(path)
    } catch {
      stat = null
    }

    if (!stat) {
      if (state.draftNotification !== null) {
        ctx.setState(clearDraftNotification)
        ctx.render()
      }
      lastMtime = null
      lastErroredPath = null
      return
    }

    // mtime unchanged — nothing to do.
    if (lastMtime === stat.mtimeMs) return

    const loaded = loadDraftFromPath(path, state.files)
    if (!loaded.ok) {
      // Only toast once per errored file-version to avoid spam.
      const key = `${path}@${stat.mtimeMs}`
      if (lastErroredPath !== key) {
        ctx.setState((s) => showToast(s, `Draft rejected: ${loaded.error}`, "error"))
        ctx.render()
        scheduleToastClear(ctx, 4000)
        lastErroredPath = key
      }
      lastMtime = stat.mtimeMs
      return
    }

    lastErroredPath = null
    lastMtime = stat.mtimeMs

    const notification: DraftNotificationState = {
      filename: loaded.draft.filename,
      line: loaded.draft.line,
      startLine: loaded.draft.startLine,
      side: loaded.draft.side,
      bodyPreview: summarizeBody(loaded.draft.body),
      mtimeMs: stat.mtimeMs,
    }
    ctx.setState((s) => setDraftNotification(s, notification))
    ctx.render()
  }

  // Fire once immediately so a pre-existing draft shows up without waiting
  // POLL_MS, then every tick after that.
  tick()
  const id = setInterval(tick, POLL_MS)

  // Keep the poller from blocking the event loop from exiting.
  if (typeof (id as { unref?: () => void }).unref === "function") {
    ;(id as { unref: () => void }).unref()
  }

  return () => clearInterval(id)
}

// ---------- action: review drafted comment ----------

/**
 * Open the review dialog. Re-loads and re-validates the draft from disk
 * (the notification only carries a display snapshot; Claude may have
 * overwritten since the last poll tick) and stashes the full draft into
 * `state.draftReview` so the dialog renders the body and the keyboard
 * handler can act on `y`/`e`/`d`/`Esc`.
 */
export async function handleReviewDraftedComment(
  ctx: AiReviewContext,
): Promise<void> {
  if (ctx.mode !== "pr" || !ctx.prInfo) {
    toastError(ctx, "Review drafted comment is only available in PR mode")
    return
  }

  const state = ctx.getState()
  const draftPath = draftPathFor({
    mode: ctx.mode,
    prInfo: ctx.prInfo,
    source: state.source,
  })

  const loaded = loadDraftFromPath(draftPath, state.files)
  if (!loaded.ok) {
    toastError(ctx, loaded.error)
    return
  }

  ctx.setState((s) => openDraftReview(s, toDialogState(loaded.draft, draftPath)))
  ctx.render()
}

// ---------- dialog actions: approve / edit / discard / cancel ----------

/**
 * `y` / Enter in the review dialog: post the comment.
 */
export async function handleApproveDraftedComment(
  ctx: AiReviewContext,
): Promise<void> {
  const state = ctx.getState()
  const review = state.draftReview
  if (!review || !ctx.prInfo) return
  await submitDraftedComment(ctx, review)
}

/**
 * `e` in the review dialog: open $EDITOR on the body, write the updated
 * body back into the draft JSON, re-validate, and re-show the dialog.
 * Bails out (leaving the draft untouched) on empty body or editor error.
 */
export async function handleEditDraftedComment(
  ctx: AiReviewContext,
): Promise<void> {
  const state = ctx.getState()
  const review = state.draftReview
  if (!review) return

  const newBody = await editBodyInEditor(ctx, review.body, review.filename, formatRange(review), review.side)
  if (newBody === null) {
    // Editor cancelled or unchanged — redraw the existing dialog.
    ctx.render()
    return
  }

  // Read the current JSON fresh (Claude may have also touched other
  // fields), overlay the new body, write it back.
  let onDisk: DraftCommentFile
  try {
    onDisk = JSON.parse(readFileSync(review.draftPath, "utf8")) as DraftCommentFile
  } catch (err) {
    toastError(ctx, `Couldn't re-read draft after edit: ${errMsg(err)}`)
    return
  }
  const updated: DraftCommentFile = {
    ...onDisk,
    body: newBody,
    draftedAt: new Date().toISOString(),
  }
  try {
    writeFileSync(review.draftPath, JSON.stringify(updated, null, 2), "utf8")
  } catch (err) {
    toastError(ctx, `Couldn't save edited draft: ${errMsg(err)}`)
    return
  }

  // Re-validate against the current diff (in case Claude's filename/line
  // references stop being valid for any reason) and re-open the dialog
  // with the new content.
  const reloaded = loadDraftFromPath(review.draftPath, ctx.getState().files)
  if (!reloaded.ok) {
    toastError(ctx, reloaded.error)
    ctx.setState(closeDraftReview)
    return
  }
  ctx.setState((s) => openDraftReview(s, toDialogState(reloaded.draft, review.draftPath)))
  // Also refresh the notification so its preview matches the new body.
  try {
    const mtimeMs = statSync(review.draftPath).mtimeMs
    ctx.setState((s) =>
      setDraftNotification(s, {
        filename: reloaded.draft.filename,
        line: reloaded.draft.line,
        startLine: reloaded.draft.startLine,
        side: reloaded.draft.side,
        bodyPreview: summarizeBody(reloaded.draft.body),
        mtimeMs,
      }),
    )
  } catch {
    // Best-effort — the next poll tick will refresh it anyway.
  }
  ctx.render()
}

/**
 * `d` in the review dialog (or "Claude: Discard drafted comment" from the
 * action menu): delete the draft file and clear the notification.
 * Idempotent.
 */
export async function handleDiscardDraftedComment(
  ctx: AiReviewContext,
): Promise<void> {
  if (ctx.mode !== "pr" || !ctx.prInfo) return
  const state = ctx.getState()
  const draftPath =
    state.draftReview?.draftPath ??
    draftPathFor({
      mode: ctx.mode,
      prInfo: ctx.prInfo,
      source: state.source,
    })

  try {
    unlinkSync(draftPath)
  } catch {
    // Already gone — fine.
  }
  ctx.setState((s) =>
    closeDraftReview(clearDraftNotification(showToast(s, "Draft discarded", "info"))),
  )
  ctx.render()
  scheduleToastClear(ctx, 1500)
}

/**
 * `n` / `Esc` in the review dialog: close the dialog without touching
 * the draft file. The notification stays — user can re-open the dialog
 * with `gd` or from the action menu.
 */
export function handleCancelDraftReview(ctx: AiReviewContext): void {
  ctx.setState(closeDraftReview)
  ctx.render()
}

// ---------- $EDITOR integration ----------

/**
 * Open `$EDITOR` on a temp file seeded with the draft body plus a
 * marker-delimited "ignore everything below" hint. Returns the new body
 * (trimmed, marker stripped) on save+quit, or null on cancel / empty.
 *
 * Modelled on `openPrCommentEditor` in src/utils/editor.ts.
 */
async function editBodyInEditor(
  ctx: AiReviewContext,
  currentBody: string,
  filename: string,
  range: string,
  side: "LEFT" | "RIGHT",
): Promise<string | null> {
  const editor = process.env.EDITOR || process.env.VISUAL || "nvim"
  const tmpFile = join(tmpdir(), `riff-draft-${randomUUID()}.md`)

  const header = [
    currentBody,
    "",
    EDIT_MARKER,
    "",
    `<!-- Target: ${filename}:${range} (${side}) -->`,
    "",
  ].join("\n")

  try {
    writeFileSync(tmpFile, header, "utf8")
  } catch (err) {
    toastError(ctx, `Couldn't create temp file for edit: ${errMsg(err)}`)
    return null
  }

  ctx.suspendRenderer()
  let exitCode: number | null = null
  try {
    const proc = Bun.spawn([editor, tmpFile], {
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    })
    exitCode = await proc.exited
  } catch (err) {
    ctx.resumeRenderer()
    ctx.render()
    try {
      unlinkSync(tmpFile)
    } catch {}
    toastError(ctx, `Editor failed: ${errMsg(err)}`)
    return null
  }
  ctx.resumeRenderer()

  if (exitCode !== 0) {
    try {
      unlinkSync(tmpFile)
    } catch {}
    return null
  }

  let edited: string
  try {
    edited = readFileSync(tmpFile, "utf8")
  } catch (err) {
    toastError(ctx, `Couldn't read edited draft: ${errMsg(err)}`)
    return null
  }
  try {
    unlinkSync(tmpFile)
  } catch {}

  // Everything before the marker is the new body. If the user deleted
  // the marker, the whole file counts.
  const markerIdx = edited.indexOf(EDIT_MARKER)
  const raw = markerIdx >= 0 ? edited.slice(0, markerIdx) : edited
  const body = raw.trim()
  if (body.length === 0) {
    // Treat empty as "leave original alone" — spec 036 edge case.
    ctx.setState((s) => showToast(s, "Edit cancelled (empty body)", "info"))
    scheduleToastClear(ctx, 2000)
    return null
  }
  return body
}

// ---------- loading + validation ----------

type LoadResult =
  | { ok: true; draft: DraftCommentFile }
  | { ok: false; error: string }

/**
 * Read the draft file from disk and validate it against the currently
 * loaded diff. Every rejection path returns a human-readable reason that
 * the caller surfaces via toast — no stack traces.
 */
export function loadDraftFromPath(
  draftPath: string,
  files: DiffFile[],
): LoadResult {
  if (!existsSync(draftPath)) {
    return { ok: false, error: "No drafted comment found (ask Claude to draft one first)" }
  }

  let raw: string
  try {
    raw = readFileSync(draftPath, "utf8")
  } catch (err) {
    return { ok: false, error: `Couldn't read draft: ${errMsg(err)}` }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    return { ok: false, error: `Draft JSON is malformed: ${errMsg(err)}` }
  }

  const shapeResult = validateShape(parsed)
  if (!shapeResult.ok) return shapeResult

  const draft = shapeResult.draft

  const diffFile = files.find((f) => f.filename === draft.filename)
  if (!diffFile) {
    return {
      ok: false,
      error: `Draft references "${draft.filename}" which is not in the current diff`,
    }
  }

  const validLines = collectDiffLineNumbers(diffFile.content, draft.side)
  if (!validLines.has(draft.line)) {
    return {
      ok: false,
      error: `Draft line ${draft.line} (${draft.side}) is not inside any hunk of ${draft.filename}`,
    }
  }
  if (draft.startLine !== undefined) {
    if (draft.startLine > draft.line) {
      return { ok: false, error: `Draft startLine (${draft.startLine}) is greater than line (${draft.line})` }
    }
    if (!validLines.has(draft.startLine)) {
      return {
        ok: false,
        error: `Draft startLine ${draft.startLine} (${draft.side}) is not inside any hunk of ${draft.filename}`,
      }
    }
  }

  return { ok: true, draft }
}

/** Narrow an unknown value from `JSON.parse` into a well-formed draft. */
function validateShape(v: unknown):
  | { ok: true; draft: DraftCommentFile }
  | { ok: false; error: string } {
  if (typeof v !== "object" || v === null) {
    return { ok: false, error: "Draft is not a JSON object" }
  }
  const o = v as Record<string, unknown>

  if (o.kind !== "inline") {
    return { ok: false, error: `Draft kind must be "inline" (got ${JSON.stringify(o.kind)})` }
  }
  if (typeof o.filename !== "string" || o.filename.length === 0) {
    return { ok: false, error: "Draft is missing a string `filename`" }
  }
  if (o.side !== "LEFT" && o.side !== "RIGHT") {
    return { ok: false, error: `Draft side must be "LEFT" or "RIGHT" (got ${JSON.stringify(o.side)})` }
  }
  if (typeof o.line !== "number" || !Number.isInteger(o.line) || o.line <= 0) {
    return { ok: false, error: "Draft `line` must be a positive integer" }
  }
  if (
    o.startLine !== undefined &&
    (typeof o.startLine !== "number" || !Number.isInteger(o.startLine) || o.startLine <= 0)
  ) {
    return { ok: false, error: "Draft `startLine`, if present, must be a positive integer" }
  }
  if (typeof o.body !== "string" || o.body.trim().length === 0) {
    return { ok: false, error: "Draft `body` must be a non-empty string" }
  }
  if (typeof o.draftedAt !== "string" || o.draftedAt.length === 0) {
    return { ok: false, error: "Draft `draftedAt` must be a non-empty string" }
  }

  return {
    ok: true,
    draft: {
      kind: "inline",
      filename: o.filename,
      side: o.side,
      line: o.line,
      startLine: o.startLine as number | undefined,
      body: o.body,
      draftedAt: o.draftedAt,
    },
  }
}

/**
 * Walk a unified-diff blob and collect every line number that lives inside
 * a hunk on the requested side.
 *
 * For `RIGHT` we count `+` and ` ` (context) lines against `newStart`.
 * For `LEFT` we count `-` and ` ` lines against `oldStart`.
 */
function collectDiffLineNumbers(content: string, side: "LEFT" | "RIGHT"): Set<number> {
  const lines = content.split("\n")
  const out = new Set<number>()
  const headerRe = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/

  let cursor: number | null = null
  for (const line of lines) {
    const header = headerRe.exec(line)
    if (header) {
      cursor = side === "RIGHT" ? Number(header[2]) : Number(header[1])
      continue
    }
    if (cursor === null) continue
    if (line.startsWith("+++") || line.startsWith("---")) continue

    const first = line.charAt(0)
    if (side === "RIGHT") {
      if (first === "+" || first === " ") {
        out.add(cursor)
        cursor++
      }
    } else {
      if (first === "-" || first === " ") {
        out.add(cursor)
        cursor++
      }
    }
  }
  return out
}

// ---------- posting ----------

async function submitDraftedComment(
  ctx: AiReviewContext,
  review: DraftReviewDialogState,
): Promise<void> {
  if (!ctx.prInfo) return
  const { owner, repo, number: prNumber } = ctx.prInfo

  // Close the dialog and surface progress immediately.
  ctx.setState((s) => closeDraftReview(showToast(s, "Posting comment…", "info")))
  ctx.render()

  let headSha: string
  try {
    headSha = await getPrHeadSha(prNumber, owner, repo)
  } catch (err) {
    ctx.setState((s) => showToast(s, `Failed to get PR head SHA: ${errMsg(err)}`, "error"))
    ctx.render()
    scheduleToastClear(ctx, 4000)
    return
  }

  const comment = createComment(review.filename, review.line, review.body, review.side)

  const range =
    review.startLine !== undefined && review.startLine !== review.line
      ? { startLine: review.startLine, startSide: review.side }
      : undefined

  const result = await submitSingleComment(owner, repo, prNumber, comment, headSha, range)

  if (!result.success) {
    ctx.setState((s) =>
      showToast(s, `Failed to post comment: ${result.error ?? "unknown error"}`, "error"),
    )
    ctx.render()
    scheduleToastClear(ctx, 5000)
    return
  }

  // Success — delete the draft file and clear the notification.
  try {
    unlinkSync(review.draftPath)
  } catch {
    // Best-effort.
  }

  ctx.setState((s) => clearDraftNotification(showToast(s, "Comment posted", "success")))
  ctx.render()
  scheduleToastClear(ctx, 2000)
}

// ---------- small helpers ----------

function toDialogState(draft: DraftCommentFile, draftPath: string): DraftReviewDialogState {
  return {
    filename: draft.filename,
    side: draft.side,
    line: draft.line,
    startLine: draft.startLine,
    body: draft.body,
    draftedAt: draft.draftedAt,
    draftPath,
  }
}

function formatRange(
  draft: { line: number; startLine?: number },
): string {
  if (draft.startLine !== undefined && draft.startLine !== draft.line) {
    return `${draft.startLine}-${draft.line}`
  }
  return String(draft.line)
}

function summarizeBody(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim()
  if (flat.length <= BODY_PREVIEW_CHARS) return flat
  return flat.slice(0, BODY_PREVIEW_CHARS - 1) + "…"
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function toastError(ctx: AiReviewContext, msg: string): void {
  ctx.setState((s) => showToast(s, msg, "error"))
  ctx.render()
  scheduleToastClear(ctx, 4000)
}

function scheduleToastClear(ctx: AiReviewContext, ms: number): void {
  setTimeout(() => {
    ctx.setState(clearToast)
    ctx.render()
  }, ms)
}
