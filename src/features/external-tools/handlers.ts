/**
 * External tools handlers (gf to open in editor, gd to open in diff viewer)
 *
 * Handles opening files in external editors and diff viewers.
 */

import { join } from "node:path"
import type { AppState } from "../../state"
import type { VimCursorState } from "../../vim-diff/types"
import type { DiffLineMapping } from "../../vim-diff/line-mapping"
import type { PrInfo } from "../../providers/github"
import { showToast, clearToast } from "../../state"
import { getVisibleFlatTreeItems } from "../../components"
import { openFileInEditor, openExternalDiffViewer } from "../../utils/editor"
import { getFileContent, getOldFileContent } from "../../providers/local"
import { getPrFileContent, getPrBaseFileContent } from "../../providers/github"
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
    const flatItems = getVisibleFlatTreeItems(state.fileTree, state.files, state.ignoredFiles, state.showHiddenFiles)
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
  const editor = process.env.EDITOR || process.env.VISUAL || "nvim"
  const workingCopy = Bun.file(filename)

  if (await workingCopy.exists()) {
    ctx.suspendRenderer()
    try {
      const args = lineNumber > 0 ? [editor, `+${lineNumber}`, filename] : [editor, filename]
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
    return
  }

  // Not in working copy — try fetching the PR-head version.
  let content: string | null = null
  if (ctx.mode === "pr" && ctx.prInfo) {
    content = await getPrFileContent(
      ctx.prInfo.owner,
      ctx.prInfo.repo,
      ctx.prInfo.number,
      filename,
    )
  }

  if (content === null) {
    ctx.setState((s) => showToast(s, `Could not read ${filename}`, "error"))
    ctx.render()
    setTimeout(() => {
      ctx.setState(clearToast)
      ctx.render()
    }, 3000)
    return
  }

  ctx.setState((s) => showToast(s, "Read-only snapshot — file not at @", "info"))
  ctx.render()
  ctx.suspendRenderer()
  try {
    await openFileInEditor(filename, content, lineNumber > 0 ? lineNumber : undefined)
  } finally {
    ctx.resumeRenderer()
    ctx.render()
  }
}

/**
 * Open the current file in $EDITOR (gf)
 * Works from: single file view, all files view (file at cursor), file tree
 */
export async function handleOpenFileInEditor(ctx: ExternalToolsContext): Promise<void> {
  const state = ctx.getState()
  const [filename, lineNumber] = getCurrentFile(ctx)

  if (!filename) {
    ctx.setState((s) => showToast(s, "No file selected", "info"))
    ctx.render()
    return
  }

  // Fetch the file content
  let content: string | null = null

  ctx.setState((s) => showToast(s, `Opening ${filename}...`, "info"))
  ctx.render()

  try {
    if (ctx.mode === "pr" && ctx.prInfo) {
      // Fetch from GitHub (head version)
      content = await getPrFileContent(
        ctx.prInfo.owner,
        ctx.prInfo.repo,
        ctx.prInfo.number,
        filename
      )
    } else {
      // Fetch from local (current working tree version)
      content = await getFileContent(filename)
    }

    if (content === null) {
      ctx.setState((s) => showToast(s, `Could not fetch ${filename}`, "error"))
      ctx.render()
      return
    }

    // Suspend the TUI and open editor
    ctx.setState(clearToast)
    ctx.suspendRenderer()

    await openFileInEditor(filename, content, lineNumber)

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

    if (ctx.mode === "pr" && ctx.prInfo) {
      // For PRs, fetch both base and head versions from GitHub
      const { owner, repo, number: prNumber } = ctx.prInfo
      const [baseContent, headContent] = await Promise.all([
        getPrBaseFileContent(owner, repo, prNumber, filename),
        getPrFileContent(owner, repo, prNumber, filename),
      ])
      oldContent = baseContent
      newContent = headContent
    } else {
      // For local diffs, get old (HEAD/@-) and new (working copy) versions
      oldContent = await getOldFileContent(filename, ctx.options.target)
      newContent = await getFileContent(filename, ctx.options.target)
    }

    if (oldContent === null && newContent === null) {
      ctx.setState((s) => showToast(s, `Could not fetch ${filename}`, "error"))
      ctx.render()
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
