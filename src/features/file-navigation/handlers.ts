/**
 * File navigation handlers (]f/[f, ]u/[u, ]o/[o, v to toggle viewed)
 *
 * Handles navigating between files in tree order, finding unviewed/outdated files.
 */

import type { AppState } from "../../state"
import type { FileReviewStatus } from "../../types"
import type { VimCursorState } from "../../vim-diff/types"
import type { DiffLineMapping } from "../../vim-diff/line-mapping"
import type { VimDiffView } from "../../components"
import type { PrInfo } from "../../providers/github"
import { getFlatTreeItems } from "../../components"
import {
  selectFile,
  isFileViewed,
  setFileViewedStatus,
  collapseFile,
  getSelectedFile,
  showToast,
  clearToast,
} from "../../state"
import { createCursorState } from "../../vim-diff/cursor-state"
import { createViewedStatus, getHeadCommit } from "../../utils/viewed-status"
import { saveFileViewedStatus } from "../../storage"
import { markFileViewedOnGitHub } from "../../providers/github"

export interface FileNavigationContext {
  // State access
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  // Vim state
  getVimState: () => VimCursorState
  setVimState: (state: VimCursorState) => void
  // Line mapping
  getLineMapping: () => DiffLineMapping
  createLineMapping: () => DiffLineMapping
  // Vim diff view
  getVimDiffView: () => VimDiffView
  // Helpers
  ensureCursorVisible: () => void
  render: () => void
  // Mode and PR info
  mode: "local" | "pr"
  prInfo: PrInfo | null
  source: string
  // Head SHA cache
  getHeadSha: () => string | null
  setHeadSha: (sha: string) => void
}

/**
 * Get files in tree order (as they appear visually in the file tree).
 */
function getFilesInTreeOrder(state: AppState): number[] {
  const flatItems = getFlatTreeItems(state.fileTree, state.files)
  return flatItems
    .filter((item) => item.fileIndex !== undefined)
    .map((item) => item.fileIndex!)
}

/**
 * Find the visual line where a file starts in the diff
 */
function findFileStartLine(lineMapping: DiffLineMapping, filename: string): number | null {
  for (let i = 0; i < lineMapping.lineCount; i++) {
    const line = lineMapping.getLine(i)
    if (line?.type === "file-header" && line.filename === filename) {
      return i
    }
  }
  return null
}

/**
 * Navigate to next/previous file selection.
 */
export function navigateFileSelection(direction: 1 | -1, ctx: FileNavigationContext): void {
  const state = ctx.getState()
  const treeOrder = getFilesInTreeOrder(state)
  if (treeOrder.length === 0) return

  if (state.selectedFileIndex === null) {
    const newIndex = direction === 1 ? treeOrder[0] : treeOrder[treeOrder.length - 1]
    if (newIndex !== undefined) {
      ctx.setState((s) => {
        const selected = selectFile(s, newIndex)
        const flatItems = getFlatTreeItems(s.fileTree, s.files)
        const treeIndex = flatItems.findIndex((item) => item.fileIndex === newIndex)
        return treeIndex !== -1 ? { ...selected, treeHighlightIndex: treeIndex } : selected
      })
    }
  } else {
    const currentPosInTree = treeOrder.indexOf(state.selectedFileIndex)
    if (currentPosInTree === -1) return

    const newPosInTree = currentPosInTree + direction
    if (newPosInTree < 0 || newPosInTree >= treeOrder.length) return

    const newFileIndex = treeOrder[newPosInTree]!
    ctx.setState((s) => {
      const selected = selectFile(s, newFileIndex)
      const flatItems = getFlatTreeItems(s.fileTree, s.files)
      const treeIndex = flatItems.findIndex((item) => item.fileIndex === newFileIndex)
      return treeIndex !== -1 ? { ...selected, treeHighlightIndex: treeIndex } : selected
    })
  }

  // Reset vim cursor and rebuild line mapping
  ctx.setVimState(createCursorState())
  ctx.createLineMapping()
  ctx.render()
  setTimeout(() => {
    ctx.render()
  }, 0)
}

/**
 * Navigate to next file in tree order (after collapsing current file).
 * Used when marking a file as viewed in all-files mode.
 */
function navigateToNextFile(currentFilename: string, ctx: FileNavigationContext): void {
  const state = ctx.getState()
  const lineMapping = ctx.getLineMapping()
  const treeOrder = getFilesInTreeOrder(state)
  if (treeOrder.length === 0) return

  const currentFileIndex = state.files.findIndex((f) => f.filename === currentFilename)
  const currentPos = currentFileIndex !== -1 ? treeOrder.indexOf(currentFileIndex) : -1

  if (currentPos === -1) return

  // First, try to find next unviewed file
  for (let i = 1; i <= treeOrder.length; i++) {
    const pos = (currentPos + i) % treeOrder.length
    const fileIndex = treeOrder[pos]!
    const file = state.files[fileIndex]

    if (file && !isFileViewed(state, file.filename)) {
      const targetLine = findFileStartLine(lineMapping, file.filename)
      if (targetLine !== null) {
        ctx.setVimState({ ...ctx.getVimState(), line: targetLine })
        ctx.getVimDiffView().updateCursor(ctx.getVimState())
        ctx.ensureCursorVisible()
      }

      const flatItems = getFlatTreeItems(state.fileTree, state.files)
      const treeIndex = flatItems.findIndex((item) => item.fileIndex === fileIndex)
      if (treeIndex !== -1) {
        ctx.setState((s) => ({ ...s, treeHighlightIndex: treeIndex }))
      }
      return
    }
  }

  // All files viewed - just go to next file in order
  const nextPos = (currentPos + 1) % treeOrder.length
  const nextFileIndex = treeOrder[nextPos]!
  const nextFile = state.files[nextFileIndex]

  if (nextFile) {
    const targetLine = findFileStartLine(lineMapping, nextFile.filename)
    if (targetLine !== null) {
      ctx.setVimState({ ...ctx.getVimState(), line: targetLine })
      ctx.getVimDiffView().updateCursor(ctx.getVimState())
      ctx.ensureCursorVisible()
    }

    const flatItems = getFlatTreeItems(state.fileTree, state.files)
    const treeIndex = flatItems.findIndex((item) => item.fileIndex === nextFileIndex)
    if (treeIndex !== -1) {
      ctx.setState((s) => ({ ...s, treeHighlightIndex: treeIndex }))
    }
  }
}

/**
 * Navigate to next/previous unviewed file.
 */
export function navigateToUnviewedFile(direction: 1 | -1, ctx: FileNavigationContext): void {
  const state = ctx.getState()
  const lineMapping = ctx.getLineMapping()
  const treeOrder = getFilesInTreeOrder(state)
  if (treeOrder.length === 0) return

  const inAllFilesView = state.selectedFileIndex === null

  // Find current file
  let currentFilename: string | null = null
  if (inAllFilesView) {
    const line = lineMapping.getLine(ctx.getVimState().line)
    currentFilename = line?.filename ?? null
  } else {
    currentFilename = state.files[state.selectedFileIndex!]?.filename ?? null
  }

  const currentFileIndex = currentFilename
    ? state.files.findIndex((f) => f.filename === currentFilename)
    : -1
  const startPos =
    currentFileIndex !== -1
      ? treeOrder.indexOf(currentFileIndex)
      : direction === 1
        ? -1
        : treeOrder.length

  // Search in the given direction
  for (let i = 1; i <= treeOrder.length; i++) {
    const pos = startPos + direction * i
    const wrappedPos = ((pos % treeOrder.length) + treeOrder.length) % treeOrder.length
    const fileIndex = treeOrder[wrappedPos]!
    const file = state.files[fileIndex]

    if (file && !isFileViewed(state, file.filename)) {
      if (inAllFilesView) {
        const targetLine = findFileStartLine(lineMapping, file.filename)
        if (targetLine !== null) {
          ctx.setVimState({ ...ctx.getVimState(), line: targetLine })
          ctx.getVimDiffView().updateCursor(ctx.getVimState())
          ctx.ensureCursorVisible()
        }
      } else {
        ctx.setState((s) => selectFile(s, fileIndex))
        ctx.setVimState(createCursorState())
        ctx.createLineMapping()
      }

      const flatItems = getFlatTreeItems(state.fileTree, state.files)
      const treeIndex = flatItems.findIndex((item) => item.fileIndex === fileIndex)
      if (treeIndex !== -1) {
        ctx.setState((s) => ({ ...s, treeHighlightIndex: treeIndex }))
      }

      ctx.render()
      setTimeout(() => ctx.render(), 0)
      return
    }
  }

  // No unviewed files found
  ctx.setState((s) => showToast(s, "All files reviewed!", "success"))
  ctx.render()
  setTimeout(() => {
    ctx.setState(clearToast)
    ctx.render()
  }, 2000)
}

/**
 * Navigate to next/previous outdated file (viewed but changed since).
 */
export function navigateToOutdatedFile(direction: 1 | -1, ctx: FileNavigationContext): void {
  const state = ctx.getState()
  const lineMapping = ctx.getLineMapping()
  const treeOrder = getFilesInTreeOrder(state)
  if (treeOrder.length === 0) return

  const inAllFilesView = state.selectedFileIndex === null

  let currentFilename: string | null = null
  if (inAllFilesView) {
    const line = lineMapping.getLine(ctx.getVimState().line)
    currentFilename = line?.filename ?? null
  } else {
    currentFilename = state.files[state.selectedFileIndex!]?.filename ?? null
  }

  const currentFileIndex = currentFilename
    ? state.files.findIndex((f) => f.filename === currentFilename)
    : -1
  const startPos =
    currentFileIndex !== -1
      ? treeOrder.indexOf(currentFileIndex)
      : direction === 1
        ? -1
        : treeOrder.length

  for (let i = 1; i <= treeOrder.length; i++) {
    const pos = startPos + direction * i
    const wrappedPos = ((pos % treeOrder.length) + treeOrder.length) % treeOrder.length
    const fileIndex = treeOrder[wrappedPos]!
    const file = state.files[fileIndex]

    const status = file ? state.fileStatuses.get(file.filename) : null
    if (file && status?.viewed && status?.isStale) {
      if (inAllFilesView) {
        const targetLine = findFileStartLine(lineMapping, file.filename)
        if (targetLine !== null) {
          ctx.setVimState({ ...ctx.getVimState(), line: targetLine })
          ctx.getVimDiffView().updateCursor(ctx.getVimState())
          ctx.ensureCursorVisible()
        }
      } else {
        ctx.setState((s) => selectFile(s, fileIndex))
        ctx.setVimState(createCursorState())
        ctx.createLineMapping()
      }

      const flatItems = getFlatTreeItems(state.fileTree, state.files)
      const treeIndex = flatItems.findIndex((item) => item.fileIndex === fileIndex)
      if (treeIndex !== -1) {
        ctx.setState((s) => ({ ...s, treeHighlightIndex: treeIndex }))
      }

      ctx.render()
      setTimeout(() => ctx.render(), 0)
      return
    }
  }

  ctx.setState((s) => showToast(s, "No outdated files", "info"))
  ctx.render()
  setTimeout(() => {
    ctx.setState(clearToast)
    ctx.render()
  }, 2000)
}

/**
 * Toggle viewed status for a specific file.
 */
export async function toggleViewedForFile(
  filename: string,
  ctx: FileNavigationContext
): Promise<boolean> {
  const state = ctx.getState()

  // Get current HEAD for viewedAtCommit
  let commitSha = ctx.getHeadSha()
  if (!commitSha) {
    commitSha = await getHeadCommit()
    if (commitSha) {
      ctx.setHeadSha(commitSha)
    }
  }

  const currentStatus = state.fileStatuses.get(filename)
  const newViewed = !currentStatus?.viewed

  const newStatus: FileReviewStatus = createViewedStatus(filename, commitSha, newViewed)

  ctx.setState((s) => setFileViewedStatus(s, newStatus))

  await saveFileViewedStatus(ctx.source, newStatus)

  // Sync to GitHub in PR mode
  if (ctx.mode === "pr" && ctx.prInfo) {
    const { owner, repo, number: prNumber } = ctx.prInfo
    markFileViewedOnGitHub(owner, repo, prNumber, filename, newViewed).then((result) => {
      if (result.success) {
        const syncedStatus = ctx.getState().fileStatuses.get(filename)
        if (syncedStatus) {
          const updated = { ...syncedStatus, githubSynced: true, syncedAt: new Date().toISOString() }
          ctx.setState((s) => setFileViewedStatus(s, updated))
          saveFileViewedStatus(ctx.source, updated)
        }
      }
    })
  }

  return newViewed
}

/**
 * Toggle viewed status for current file and optionally advance to next
 */
export async function handleToggleViewed(
  advanceToNext: boolean,
  ctx: FileNavigationContext
): Promise<void> {
  const state = ctx.getState()
  let filename: string | null = null
  const inAllFilesView = state.selectedFileIndex === null

  const selectedFile = getSelectedFile(state)
  if (selectedFile) {
    filename = selectedFile.filename
  } else {
    const line = ctx.getLineMapping().getLine(ctx.getVimState().line)
    if (line?.filename) {
      filename = line.filename
    }
  }

  if (!filename) return

  const newViewed = await toggleViewedForFile(filename, ctx)

  // In all-files view, when marking as viewed: collapse and jump to next
  if (inAllFilesView && newViewed) {
    ctx.setState((s) => collapseFile(s, filename!))
    ctx.createLineMapping()
    navigateToNextFile(filename, ctx)
  }

  ctx.render()

  // If advancing (and not in all-files view) and now viewed, go to next unviewed
  if (advanceToNext && !inAllFilesView && newViewed) {
    navigateToUnviewedFile(1, ctx)
  }
}
