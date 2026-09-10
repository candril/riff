/**
 * External tools handlers (ge to open in editor, gd to open in diff viewer)
 *
 * Handles opening files in external editors and diff viewers.
 */

import { $ } from "bun"
import { join } from "node:path"
import type { AppState } from "../../state"
import type { VimCursorState } from "../../vim-diff/types"
import type { DiffLineMapping } from "../../vim-diff/line-mapping"
import type { PrInfo } from "../../providers/github"
import { showToast, clearToast } from "../../state"
import { getVisibleFlatTreeItems } from "../../components"
import {
  openFileInEditor,
  openExternalDiffViewer,
  openInTmuxWindow,
  insideTmux,
  writeSnapshotFile,
} from "../../utils/editor"
import { getFileContent, getOldFileContent } from "../../providers/local"
import {
  getPrFileContent,
  getPrBaseFileContent,
  type FileContentResult,
} from "../../providers/github"
import { findLocalRepoPath, checkoutPR } from "../../utils/repo-path"
import { loadConfig } from "../../config"

export interface ExternalToolsContext {
  // State access
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  // Vim state
  getVimState: () => VimCursorState
  // Line mapping
  getLineMapping: () => DiffLineMapping
  // Render
  render: () => void
  // Renderer control
  suspendRenderer: () => void
  resumeRenderer: () => void
  // Mode and PR info
  mode: "local" | "pr"
  prInfo: PrInfo | null
  /** SHA of the PR head riff loaded the diff at. Empty in local mode.
   *  Passing it spares a `gh pr view` (GraphQL) per file open. */
  getHeadSha: () => string
  // Options for local diff target
  options: { target?: string }
}

/**
 * Get the current file to operate on based on context.
 * Returns [filename, lineNumber] or [null, undefined] if no file selected.
 */
function getCurrentFile(ctx: ExternalToolsContext): [string | null, number | undefined] {
  const state = ctx.getState()
  const lineMapping = ctx.getLineMapping()
  const vimState = ctx.getVimState()

  if (state.focusedPanel === "tree") {
    // From file tree - use highlighted file
    const flatItems = getVisibleFlatTreeItems(state.fileTree, state.files, state.ignoredFiles, state.showHiddenFiles, state.treeFilter)
    const highlightedItem = flatItems[state.treeHighlightIndex]
    if (highlightedItem && !highlightedItem.node.isDirectory) {
      return [highlightedItem.node.path, undefined]
    }
  } else if (state.selectedFileIndex !== null) {
    // Single file view - use selected file
    const file = state.files[state.selectedFileIndex]
    if (file) {
      const currentLine = lineMapping.getLine(vimState.line)
      const lineNumber = currentLine?.newLineNum ?? undefined
      return [file.filename, lineNumber]
    }
  } else {
    // All files view - use file at cursor
    const currentLine = lineMapping.getLine(vimState.line)
    if (currentLine?.filename) {
      const lineNumber = currentLine.newLineNum ?? undefined
      return [currentLine.filename, lineNumber]
    }
  }

  return [null, undefined]
}

/**
 * Whether the checkout in front of us is the revision riff is showing.
 *
 * In local mode the working copy *is* the diff. In PR mode it only matches
 * when the PR branch is actually checked out — otherwise the file on disk is
 * some other revision, and opening it would quietly show unrelated lines
 * under the diff's line numbers. Cheap enough to ask every time: it's a
 * local `git rev-parse`, no API.
 */
async function workingCopyIsAtHead(ctx: ExternalToolsContext): Promise<boolean> {
  if (ctx.mode !== "pr") return true

  const headSha = ctx.getHeadSha()
  if (!headSha) return false

  const local = await $`git rev-parse HEAD`.quiet().nothrow()
  return local.exitCode === 0 && local.stdout.toString().trim() === headSha
}

/** The real file, when it's both present and the right revision. */
async function canOpenInPlace(ctx: ExternalToolsContext, filename: string): Promise<boolean> {
  return (await workingCopyIsAtHead(ctx)) && (await Bun.file(filename).exists())
}

/**
 * Open the real file in $EDITOR and block until it exits.
 *
 * Preferred over a snapshot wherever the working copy has the file: edits to
 * a temp copy are silently discarded when the editor closes.
 */
async function openInPlace(
  ctx: ExternalToolsContext,
  filename: string,
  lineNumber?: number,
): Promise<void> {
  const editor = process.env.EDITOR || process.env.VISUAL || "nvim"
  const args = lineNumber ? [editor, `+${lineNumber}`, filename] : [editor, filename]

  ctx.suspendRenderer()
  try {
    const proc = Bun.spawn(args, {
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    })
    await proc.exited
  } finally {
    ctx.resumeRenderer()
    ctx.render()
  }
}

/**
 * Open a specific file at a specific line in $EDITOR (spec 043).
 * Used for jumping from a CI check annotation to its source location.
 *
 * Strategy:
 *  1. If the file exists in the working copy, open the real file
 *     in-place so edits persist.
 *  2. Otherwise — common in jj repos where the bookmark is fetched
 *     but `@` is elsewhere, so the working copy lacks the PR's
 *     files — fall back to a read-only snapshot fetched from the
 *     PR head on GitHub. Toasts so the user knows it's read-only.
 */
export async function handleOpenFileAtLine(
  ctx: ExternalToolsContext,
  filename: string,
  lineNumber: number,
): Promise<void> {
  if (await Bun.file(filename).exists()) {
    await openInPlace(ctx, filename, lineNumber > 0 ? lineNumber : undefined)
    return
  }

  // Not in working copy — try fetching the PR-head version.
  const fetched = await fetchHeadContent(ctx, filename)
  if (!fetched.ok) {
    toast(ctx, `Could not read ${filename} — ${fetched.error}`, "error", 4000)
    return
  }

  toast(ctx, "Read-only snapshot — file not at @", "info")
  ctx.suspendRenderer()
  try {
    await openFileInEditor(filename, fetched.content, lineNumber > 0 ? lineNumber : undefined)
  } finally {
    ctx.resumeRenderer()
    ctx.render()
  }
}

/**
 * The file as it exists at the revision riff is showing. PR mode goes to
 * GitHub at the loaded head; local mode reads the working tree.
 */
async function fetchHeadContent(
  ctx: ExternalToolsContext,
  filename: string,
): Promise<FileContentResult> {
  if (ctx.mode === "pr" && ctx.prInfo) {
    return getPrFileContent(
      ctx.prInfo.owner,
      ctx.prInfo.repo,
      ctx.prInfo.number,
      filename,
      ctx.getHeadSha(),
    )
  }
  const content = await getFileContent(filename)
  return content === null
    ? { ok: false, error: "not in the working tree" }
    : { ok: true, content }
}

/**
 * Open the current file in $EDITOR (ge)
 * Works from: single file view, all files view (file at cursor), file tree
 *
 * The working copy wins when it has the file — both because edits to a
 * snapshot are thrown away, and because it needs no network at all, so `ge`
 * keeps working when GitHub doesn't.
 */
export async function handleOpenFileInEditor(ctx: ExternalToolsContext): Promise<void> {
  const [filename, lineNumber] = getCurrentFile(ctx)

  if (!filename) {
    toast(ctx, "No file selected", "info", 2000)
    return
  }

  if (await canOpenInPlace(ctx, filename)) {
    ctx.setState(clearToast)
    await openInPlace(ctx, filename, lineNumber)
    return
  }

  ctx.setState((s) => showToast(s, `Opening ${filename}...`, "info"))
  ctx.render()

  try {
    const fetched = await fetchHeadContent(ctx, filename)
    if (!fetched.ok) {
      toast(ctx, `Could not fetch ${filename} — ${fetched.error}`, "error", 4000)
      return
    }

    ctx.setState(clearToast)
    ctx.suspendRenderer()
    await openFileInEditor(filename, fetched.content, lineNumber)
    ctx.resumeRenderer()
    ctx.render()
  } catch (err) {
    ctx.resumeRenderer()
    const msg = err instanceof Error ? err.message : "Unknown error"
    toast(ctx, `Error: ${msg}`, "error")
  }
}

function toast(
  ctx: ExternalToolsContext,
  message: string,
  variant: "info" | "error" | "success",
  ms = 3000,
): void {
  ctx.setState((s) => showToast(s, message, variant))
  ctx.render()
  setTimeout(() => {
    ctx.setState(clearToast)
    ctx.render()
  }, ms)
}

/**
 * Open the current file in $EDITOR in a new tmux window (gE).
 *
 * Unlike `ge` this leaves riff running, so the diff stays on screen next to
 * the editor. Prefers the working copy — a file riff hands to another window
 * should be the one edits actually persist to — and only falls back to a
 * read-only PR snapshot when the working copy doesn't have it.
 */
export async function handleOpenFileInTmuxWindow(ctx: ExternalToolsContext): Promise<void> {
  const [filename, lineNumber] = getCurrentFile(ctx)
  if (!filename) {
    toast(ctx, "No file selected", "info")
    return
  }
  await handleOpenPathInTmuxWindow(ctx, filename, lineNumber)
}

/**
 * The same, for a path riff was pointed at rather than one it is showing —
 * a link followed out of the diff (spec 057).
 */
export async function handleOpenPathInTmuxWindow(
  ctx: ExternalToolsContext,
  filename: string,
  lineNumber?: number,
): Promise<void> {
  if (!insideTmux()) {
    toast(ctx, "Not running inside tmux", "info")
    return
  }

  if (await canOpenInPlace(ctx, filename)) {
    const opened = await openInTmuxWindow(filename, lineNumber, { cwd: process.cwd() })
    if (!opened.ok) {
      toast(ctx, `tmux: ${opened.error}`, "error")
      return
    }
    toast(ctx, `Opened ${filename} in a new tmux window`, "success", 2000)
    return
  }

  const fetched = await fetchHeadContent(ctx, filename)
  if (!fetched.ok) {
    toast(ctx, `Could not fetch ${filename} — ${fetched.error}`, "error", 4000)
    return
  }

  const snapshot = await writeSnapshotFile(filename, fetched.content)
  const opened = await openInTmuxWindow(snapshot, lineNumber, { removeWhenClosed: true })
  if (!opened.ok) {
    toast(ctx, `tmux: ${opened.error}`, "error")
    return
  }
  toast(ctx, `Opened ${filename} in tmux — read-only snapshot`, "info")
}

/**
 * Open current file in an external diff viewer (difftastic, delta, nvim)
 */
export async function handleOpenExternalDiff(
  viewer: "difftastic" | "delta" | "nvim",
  ctx: ExternalToolsContext
): Promise<void> {
  const state = ctx.getState()
  const [filename] = getCurrentFile(ctx)

  if (!filename) {
    ctx.setState((s) => showToast(s, "No file selected", "info"))
    ctx.render()
    return
  }

  const viewerNames = { difftastic: "difftastic", delta: "delta", nvim: "nvim diff" }
  ctx.setState((s) => showToast(s, `Opening ${filename} in ${viewerNames[viewer]}...`, "info"))
  ctx.render()

  try {
    let oldContent: string | null = null
    let newContent: string | null = null
    let failure = "no content on either side"

    if (ctx.mode === "pr" && ctx.prInfo) {
      // For PRs, fetch both base and head versions from GitHub
      const { owner, repo, number: prNumber } = ctx.prInfo
      const [base, head] = await Promise.all([
        getPrBaseFileContent(owner, repo, prNumber, filename, ctx.prInfo.baseRef),
        getPrFileContent(owner, repo, prNumber, filename, ctx.getHeadSha()),
      ])
      oldContent = base.ok ? base.content : null
      newContent = head.ok ? head.content : null
      // Both sides missing is the failure case; report the head's reason,
      // since a new file legitimately has no base.
      if (!head.ok) failure = head.error
    } else {
      // For local diffs, get old (HEAD/@-) and new (working copy) versions
      oldContent = await getOldFileContent(filename, ctx.options.target)
      newContent = await getFileContent(filename, ctx.options.target)
    }

    if (oldContent === null && newContent === null) {
      toast(ctx, `Could not fetch ${filename} — ${failure}`, "error", 4000)
      return
    }

    // Handle new files (no old content) or deleted files (no new content)
    oldContent = oldContent ?? ""
    newContent = newContent ?? ""

    // Suspend the TUI and open diff viewer
    ctx.setState(clearToast)
    ctx.suspendRenderer()

    await openExternalDiffViewer(oldContent, newContent, filename, viewer)

    // Resume the TUI
    ctx.resumeRenderer()
    ctx.render()
  } catch (err) {
    ctx.resumeRenderer()
    const msg = err instanceof Error ? err.message : "Unknown error"
    ctx.setState((s) => showToast(s, `Error: ${msg}`, "error"))
    ctx.render()
  }
}

/**
 * Checkout the PR branch and open the current file in $EDITOR (gc)
 * 
 * This command:
 * 1. Finds the local repo path using config mappings
 * 2. Runs `gh pr checkout` to switch to the PR branch
 * 3. Opens the actual file (not a temp copy) in the editor at the current line
 * 
 * Only available in PR mode when a local repo path is configured.
 */
export async function handleCheckoutAndEdit(ctx: ExternalToolsContext): Promise<void> {
  // Only works in PR mode
  if (ctx.mode !== "pr" || !ctx.prInfo) {
    ctx.setState((s) => showToast(s, "Checkout only available in PR mode", "info"))
    ctx.render()
    return
  }

  const [filename, lineNumber] = getCurrentFile(ctx)

  if (!filename) {
    ctx.setState((s) => showToast(s, "No file selected", "info"))
    ctx.render()
    return
  }

  // Find local repo path
  const config = loadConfig()
  const repoName = `${ctx.prInfo.owner}/${ctx.prInfo.repo}`
  const localPath = findLocalRepoPath(repoName, config)

  if (!localPath) {
    ctx.setState((s) => showToast(s, `No local path configured for ${repoName}`, "error"))
    ctx.render()
    return
  }

  ctx.setState((s) => showToast(s, `Checking out PR #${ctx.prInfo!.number}...`, "info"))
  ctx.render()

  try {
    // Checkout the PR branch
    const checkoutResult = await checkoutPR(ctx.prInfo.number, repoName, localPath)

    if (!checkoutResult.success) {
      ctx.setState((s) => showToast(s, checkoutResult.message, "error"))
      ctx.render()
      return
    }

    // Build full file path
    const fullPath = join(localPath, filename)

    // Clear toast and suspend TUI
    ctx.setState(clearToast)
    ctx.suspendRenderer()

    // Open the actual file (not a temp copy) in the editor
    // Use $EDITOR directly with the file path
    const editor = process.env.EDITOR || process.env.VISUAL || "nvim"
    const args = lineNumber ? [editor, `+${lineNumber}`, fullPath] : [editor, fullPath]

    const proc = Bun.spawn(args, {
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    })

    await proc.exited

    // Resume the TUI
    ctx.resumeRenderer()
    ctx.render()
  } catch (err) {
    ctx.resumeRenderer()
    const msg = err instanceof Error ? err.message : "Unknown error"
    ctx.setState((s) => showToast(s, `Error: ${msg}`, "error"))
    ctx.render()
  }
}
