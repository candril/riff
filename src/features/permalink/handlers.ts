/**
 * Copy a GitHub permalink for whatever the user is currently aiming at:
 * the visual-line selection, the line under the cursor, or the whole file.
 *
 * The ref pins to the *revision riff is displaying*, not to the newest tip of
 * the branch — the line numbers come from that revision's diff, and a branch
 * that has moved (or, locally, never contained the working copy at all) sends
 * the reader to the wrong lines. This is the same reason GitHub's own "copy
 * permalink" swaps the branch for a SHA.
 */

import type { AppState } from "../../state"
import type { VimCursorState } from "../../vim-diff/types"
import type { DiffLineMapping } from "../../vim-diff/line-mapping"
import type { PrInfo } from "../../providers/github"
import type { Comment } from "../../types"
import { showToast, clearToast } from "../../state"
import { getVisibleFlatTreeItems } from "../../components"
import { copyToClipboard } from "../../utils/clipboard"
import { buildPermalinkUrl, buildPrDiffUrl, lineAnchor, type RepoRef } from "./url"
import { repoRefForPr, resolveLocalRepoRef, fileDiffersAtRef } from "./repo-ref"
import { linkForComment, linkForFocusedTarget } from "./comment-link"

export interface PermalinkContext {
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  getVimState: () => VimCursorState
  getLineMapping: () => DiffLineMapping
  render: () => void
  mode: "local" | "pr"
  prInfo: PrInfo | null
  /** SHA of the PR head riff loaded the diff at. Empty in local mode. */
  getHeadSha: () => string
}

/** What a permalink would cover right now. Drives the palette label. */
export type PermalinkScope = "selection" | "line" | "file"

/**
 * Detect the scope from the state the action registry has on hand (no line
 * mapping), so the palette can name what it is about to copy.
 */
export function detectPermalinkScope(
  state: AppState,
  vimState?: VimCursorState,
): PermalinkScope {
  if (vimState?.mode === "visual-line" && vimState.selectionAnchor !== null) {
    return "selection"
  }
  if (state.focusedPanel === "tree") return "file"
  if (state.viewMode === "diff") return "line"
  return "file"
}

interface Target {
  filename: string
  startLine?: number
  endLine?: number
}

export async function handleCopyPermalink(
  ctx: PermalinkContext,
  options: { includeLines: boolean },
): Promise<void> {
  const target = resolveTarget(ctx, options.includeLines)
  if (!target) {
    toast(ctx, "No file under the cursor", "info")
    return
  }

  const repo = await resolveRepoRef(ctx)
  if (!repo) {
    toast(
      ctx,
      "No GitHub remote or branch to link to",
      "error",
      3000,
    )
    return
  }

  const url = buildPermalinkUrl({ ...repo, path: target.filename, ...lineRange(target) })
  const copied = await copyToClipboard(url)
  if (!copied.ok) {
    toast(ctx, `Copy failed: ${copied.error}`, "error", 3000)
    return
  }

  // A local diff usually shows the working copy, which by definition isn't on
  // GitHub yet. The link is still the best one available, but the lines it
  // lands on are whatever that ref holds — say so rather than let the reader
  // discover it.
  const drifted =
    ctx.mode === "local" && (await fileDiffersAtRef(repo.ref, target.filename))
  if (drifted) {
    toast(
      ctx,
      `Copied, but ${target.filename} differs from ${shortRef(repo.ref)} — lines may not match`,
      "info",
      4000,
    )
    return
  }

  toast(ctx, `Copied permalink: ${describe(repo, target)}`, "success", 2500)
}

/**
 * Copy a link into the PR's Files-changed view instead of the file's contents.
 *
 * Different use case from a blob permalink: this lands on the change itself —
 * both columns, the hunk around it, the review comments on it — which is what
 * you want when pointing someone at something under discussion rather than at
 * code as it stands.
 */
export async function handleCopyPrDiffLink(ctx: PermalinkContext): Promise<void> {
  const state = ctx.getState()
  const prInfo = ctx.prInfo
  if (ctx.mode !== "pr" || !prInfo) {
    toast(ctx, "Not reviewing a PR", "info")
    return
  }

  const target = resolveDiffTarget(ctx)
  if (!target) {
    toast(ctx, "No file under the cursor", "info")
    return
  }

  const url = buildPrDiffUrl({
    origin: originOf(prInfo.url),
    // The PR itself lives on the base repo even when the branch is a fork's.
    owner: prInfo.owner,
    repo: prInfo.repo,
    prNumber: prInfo.number,
    commitSha: state.viewingCommit ?? undefined,
    path: target.filename,
    line: target.line,
    side: target.side,
  })

  const copied = await copyToClipboard(url)
  if (!copied.ok) {
    toast(ctx, `Copy failed: ${copied.error}`, "error", 3000)
    return
  }

  const where = target.line === undefined
    ? target.filename
    : `${target.filename}:${target.side === "LEFT" ? "-" : "+"}${target.line}`
  toast(ctx, `Copied PR diff link: ${where}`, "success", 2500)
}

/**
 * Copy a link to a specific comment.
 *
 * `focused` is the comment the caller knows about — the overlay's highlighted
 * row. Without one, the cursor's own thread wins, then whatever the view last
 * marked as reactable, which is how the PR info panel's selection is picked up.
 */
export async function handleCopyCommentLink(
  ctx: PermalinkContext,
  focused?: Comment | null,
): Promise<void> {
  const state = ctx.getState()
  if (ctx.mode !== "pr" || !state.prInfo) {
    toast(ctx, "Not reviewing a PR", "info")
    return
  }

  const comment = focused ?? commentAtCursor(ctx)
  const link = comment ? linkForComment(state, comment) : linkForFocusedTarget(state)

  if (!link) {
    toast(ctx, "No comment here — move to a thread first", "info")
    return
  }
  if (!link.ok) {
    toast(ctx, link.reason, "info", 3000)
    return
  }

  const copied = await copyToClipboard(link.url)
  if (!copied.ok) {
    toast(ctx, `Copy failed: ${copied.error}`, "error", 3000)
    return
  }

  toast(ctx, `Copied link to ${link.label}`, "success", 2500)
}

/**
 * The root comment of the thread under the diff cursor. Replies share the
 * thread's anchor, so the root is the one worth linking to.
 */
function commentAtCursor(ctx: PermalinkContext): Comment | null {
  const state = ctx.getState()
  const anchor = ctx.getLineMapping().getCommentAnchor(ctx.getVimState().line)
  if (!anchor) return null

  const onLine = state.comments.filter(
    (c) =>
      c.filename === anchor.filename &&
      c.line === anchor.line &&
      c.side === anchor.side &&
      !c.inReplyTo,
  )
  return onLine[0] ?? null
}

interface DiffTarget {
  filename: string
  line?: number
  side?: "LEFT" | "RIGHT"
}

/**
 * Resolve the diff row to anchor on. Reuses the comment anchor the diff view
 * already computes, so a deletion links to its left-hand line — which a blob
 * permalink can't express at all.
 *
 * A selection lands on its first line: GitHub's diff rows have no range
 * anchor to point at.
 */
function resolveDiffTarget(ctx: PermalinkContext): DiffTarget | null {
  const state = ctx.getState()
  const vimState = ctx.getVimState()
  const lineMapping = ctx.getLineMapping()

  const fileOnly = resolveTarget(ctx, false)
  if (!fileOnly) return null
  if (state.focusedPanel === "tree" || state.viewMode !== "diff") return fileOnly

  const start =
    vimState.mode === "visual-line" && vimState.selectionAnchor !== null
      ? Math.min(vimState.selectionAnchor, vimState.line)
      : vimState.line
  const end =
    vimState.mode === "visual-line" && vimState.selectionAnchor !== null
      ? Math.max(vimState.selectionAnchor, vimState.line)
      : vimState.line

  for (let i = start; i <= end; i++) {
    const anchor = lineMapping.getCommentAnchor(i)
    if (anchor?.filename !== fileOnly.filename) continue
    return { filename: anchor.filename, line: anchor.line, side: anchor.side }
  }

  return fileOnly
}

function originOf(prUrl: string): string {
  try {
    return new URL(prUrl).origin
  } catch {
    return "https://github.com"
  }
}

function lineRange(target: Target): { startLine?: number; endLine?: number } {
  return { startLine: target.startLine, endLine: target.endLine }
}

async function resolveRepoRef(ctx: PermalinkContext): Promise<RepoRef | null> {
  if (ctx.mode === "pr" && ctx.prInfo) {
    // Viewing one commit's diff means the line numbers are that commit's, so
    // that's what the link has to pin to; otherwise the head riff loaded.
    const displayed = ctx.getState().viewingCommit || ctx.getHeadSha()
    return repoRefForPr(ctx.prInfo, displayed || undefined)
  }
  return resolveLocalRepoRef()
}

/**
 * Resolve the file and, when asked for, the line range to anchor on.
 *
 * Deleted lines exist only in the base version, so they carry no line number
 * in the file the permalink points at. Rather than linking to a line that
 * shows unrelated content, those fall back to a file-level link.
 */
function resolveTarget(ctx: PermalinkContext, includeLines: boolean): Target | null {
  const state = ctx.getState()
  const vimState = ctx.getVimState()
  const lineMapping = ctx.getLineMapping()

  if (state.focusedPanel === "tree") {
    const flatItems = getVisibleFlatTreeItems(
      state.fileTree,
      state.files,
      state.ignoredFiles,
      state.showHiddenFiles,
    )
    const highlighted = flatItems[state.treeHighlightIndex]
    if (!highlighted || highlighted.node.isDirectory) return null
    return { filename: highlighted.node.path }
  }

  const filename =
    state.selectedFileIndex !== null
      ? state.files[state.selectedFileIndex]?.filename
      : lineMapping.getLine(vimState.line)?.filename
  if (!filename) return null

  if (!includeLines || state.viewMode !== "diff") return { filename }

  if (vimState.mode === "visual-line" && vimState.selectionAnchor !== null) {
    const start = Math.min(vimState.selectionAnchor, vimState.line)
    const end = Math.max(vimState.selectionAnchor, vimState.line)
    const numbers: number[] = []
    for (let i = start; i <= end; i++) {
      const line = lineMapping.getLine(i)
      if (line?.filename !== filename) continue
      if (line.newLineNum !== undefined) numbers.push(line.newLineNum)
    }
    if (numbers.length === 0) return { filename }
    return {
      filename,
      startLine: Math.min(...numbers),
      endLine: Math.max(...numbers),
    }
  }

  const line = lineMapping.getLine(vimState.line)
  if (line?.filename !== filename || line.newLineNum === undefined) return { filename }
  return { filename, startLine: line.newLineNum }
}

function describe(repo: RepoRef, target: Target): string {
  const anchor = lineAnchor(target.startLine, target.endLine)
  const location = anchor ? `${target.filename}#${anchor}` : target.filename
  return `${location} @ ${shortRef(repo.ref)}`
}

/** Abbreviate a SHA for display; branch names pass through untouched. */
function shortRef(ref: string): string {
  return /^[0-9a-f]{40}$/i.test(ref) ? ref.slice(0, 7) : ref
}

function toast(
  ctx: PermalinkContext,
  message: string,
  kind: "info" | "error" | "success",
  ms = 2000,
): void {
  ctx.setState((s) => showToast(s, message, kind))
  ctx.render()
  setTimeout(() => {
    ctx.setState(clearToast)
    ctx.render()
  }, ms)
}
