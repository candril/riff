/**
 * Surface a PR review comment that Claude drafted into `draft-comment.json`
 * so the user can copy it and post it themselves.
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
 *      - Direct: `gd` (copy body to clipboard, then clear the draft) /
 *        `gD` (clear without copying) chords.
 *      - Action menu: "Claude: Copy drafted comment" / "Claude: Dismiss
 *        drafted comment".
 */

import { existsSync, readFileSync, statSync, unlinkSync } from "node:fs"
import {
  showToast,
  clearToast,
  setDraftNotification,
  clearDraftNotification,
  type DraftNotificationState,
} from "../../state"
import type { DiffFile } from "../../utils/diff-parser"
import type { AiReviewContext } from "./handlers"
import { draftPathFor } from "./handlers"

const POLL_MS = 1500
const BODY_PREVIEW_CHARS = 140

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

// ---------- action: copy drafted comment ----------

/**
 * `gd` / "Claude: Copy drafted comment": put the draft body on the
 * clipboard so the user can paste it into GitHub themselves, then clear
 * the draft — one keystroke ends the whole flow.
 *
 * Re-loads and re-validates from disk rather than using the notification's
 * snapshot — Claude may have overwritten the draft since the last poll
 * tick. A failed copy leaves the draft in place so nothing is lost.
 */
export async function handleCopyDraftedComment(
  ctx: AiReviewContext,
): Promise<void> {
  if (ctx.mode !== "pr" || !ctx.prInfo) {
    toastError(ctx, "Drafted comments are only available in PR mode")
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

  const copied = copyToClipboard(loaded.draft.body)
  if (!copied.ok) {
    toastError(ctx, `Couldn't copy to clipboard: ${copied.error}`)
    return
  }

  try {
    unlinkSync(draftPath)
  } catch {
    // Best-effort — the poller clears the notification either way.
  }
  ctx.setState((s) => clearDraftNotification(showToast(s, "Comment copied", "success")))
  ctx.render()
  scheduleToastClear(ctx, 2000)
}

/**
 * `gD` / "Claude: Dismiss drafted comment": delete the draft file and
 * clear the notification. Idempotent.
 */
export async function handleDiscardDraftedComment(
  ctx: AiReviewContext,
): Promise<void> {
  if (ctx.mode !== "pr" || !ctx.prInfo) return
  const draftPath = draftPathFor({
    mode: ctx.mode,
    prInfo: ctx.prInfo,
    source: ctx.getState().source,
  })

  try {
    unlinkSync(draftPath)
  } catch {
    // Already gone — fine.
  }
  ctx.setState((s) => clearDraftNotification(showToast(s, "Draft discarded", "info")))
  ctx.render()
  scheduleToastClear(ctx, 1500)
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

// ---------- small helpers ----------

function summarizeBody(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim()
  if (flat.length <= BODY_PREVIEW_CHARS) return flat
  return flat.slice(0, BODY_PREVIEW_CHARS - 1) + "…"
}

/**
 * Spawn the platform clipboard command and pipe the body into it.
 * Failures are reported rather than thrown so the caller can toast them.
 */
function copyToClipboard(text: string): { ok: true } | { ok: false; error: string } {
  const cmd =
    process.platform === "darwin"
      ? ["pbcopy"]
      : ["xclip", "-selection", "clipboard"]
  try {
    const proc = Bun.spawn(cmd, { stdin: "pipe" })
    proc.stdin.write(text)
    proc.stdin.end()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: errMsg(err) }
  }
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
