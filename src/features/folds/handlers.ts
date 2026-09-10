/**
 * Fold handlers (za, zo, zc, zR, zM, gg, G)
 *
 * Handles folding operations across tree, comments, and diff views.
 */

import type { AppState } from "../../state"
import type { VimCursorState } from "../../vim-diff/types"
import type { DiffLineMapping } from "../../vim-diff/line-mapping"
import type { FileTreePanel } from "../../components/FileTreePanel"
import type { VimDiffView } from "../../components"
import { getVisibleFlatTreeItems } from "../../components"
import {
  updateFileTree,
  toggleFileFold,
  expandAllFiles,
  collapseAllFiles,
  toggleBlockFold,
  setBlockFolds,
  expandAllBlocks,
} from "../../state"
import { toggleNodeExpansion } from "../../utils/file-tree"

export interface FoldsContext {
  // State access
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  // Vim state
  getVimState: () => VimCursorState
  setVimState: (state: VimCursorState) => void
  // Line mapping
  getLineMapping: () => DiffLineMapping
  rebuildLineMapping: () => void
  // Panels
  getFileTreePanel: () => FileTreePanel
  getVimDiffView: () => VimDiffView
  // Update helpers
  updateFileTreePanel: () => void
  ensureCursorVisible: () => void
  render: () => void
  // Divider expansion (reuse existing handler)
  handleExpandDivider: () => void
}

/**
 * Get the filename at the current cursor position in all-files mode
 */
function getFilenameAtCursor(ctx: FoldsContext): string | null {
  const state = ctx.getState()
  if (state.selectedFileIndex !== null) {
    const file = state.files[state.selectedFileIndex]
    return file?.filename ?? null
  }
  const lineInfo = ctx.getLineMapping().getLine(ctx.getVimState().line)
  if (lineInfo?.filename) {
    return lineInfo.filename
  }
  return null
}

/**
 * Find the file header line for a given filename in the current line mapping
 */
function findFileHeaderLine(ctx: FoldsContext, filename: string): number {
  const lineMapping = ctx.getLineMapping()
  for (let i = 0; i < lineMapping.lineCount; i++) {
    const line = lineMapping.getLine(i)
    if (line?.type === "file-header" && line.filename === filename) {
      return i
    }
  }
  return 0
}

/**
 * Go to top (gg) - works in tree, comments, and diff views
 */
export function handleGoToTop(ctx: FoldsContext): void {
  const state = ctx.getState()

  if (state.focusedPanel === "tree") {
    ctx.setState((s) => ({ ...s, treeHighlightIndex: 0 }))
    ctx.updateFileTreePanel()
    ctx.getFileTreePanel().ensureHighlightVisible()
    return
  }

  // Diff view - go to first line
  ctx.setVimState({ ...ctx.getVimState(), line: 0, col: 0 })
  ctx.getVimDiffView().updateCursor(ctx.getVimState())
  ctx.ensureCursorVisible()
}

/**
 * Go to bottom (G) - works in tree, comments, and diff views
 */
export function handleGoToBottom(ctx: FoldsContext): void {
  const state = ctx.getState()

  if (state.focusedPanel === "tree") {
    const flatItems = getVisibleFlatTreeItems(state.fileTree, state.files, state.ignoredFiles, state.showHiddenFiles, state.treeFilter)
    ctx.setState((s) => ({ ...s, treeHighlightIndex: Math.max(0, flatItems.length - 1) }))
    ctx.updateFileTreePanel()
    ctx.getFileTreePanel().ensureHighlightVisible()
    return
  }

  // Diff view - go to last line
  const lastLine = Math.max(0, ctx.getLineMapping().lineCount - 1)
  ctx.setVimState({ ...ctx.getVimState(), line: lastLine, col: 0 })
  ctx.getVimDiffView().updateCursor(ctx.getVimState())
  ctx.ensureCursorVisible()
}

/**
 * Toggle fold at cursor (za)
 */
export function handleToggleFoldAtCursor(ctx: FoldsContext): void {
  const state = ctx.getState()

  if (state.focusedPanel === "tree") {
    const flatItems = getVisibleFlatTreeItems(state.fileTree, state.files, state.ignoredFiles, state.showHiddenFiles, state.treeFilter)
    const highlightedItem = flatItems[state.treeHighlightIndex]
    if (!highlightedItem) return

    if (highlightedItem.node.isDirectory) {
      const newTree = toggleNodeExpansion(state.fileTree, highlightedItem.node.path)
      ctx.setState((s) => updateFileTree(s, newTree))
      ctx.render()
    } else {
      // On a file - find and toggle parent directory
      for (let i = state.treeHighlightIndex - 1; i >= 0; i--) {
        const item = flatItems[i]
        if (item && item.node.isDirectory && item.depth < highlightedItem.depth) {
          const newTree = toggleNodeExpansion(state.fileTree, item.node.path)
          ctx.setState((s) => ({ ...updateFileTree(s, newTree), treeHighlightIndex: i }))
          ctx.render()
          break
        }
      }
    }
    return
  }

  // Diff view - toggle folds
  const dividerKey = ctx.getLineMapping().getDividerKey(ctx.getVimState().line)
  if (dividerKey) {
    ctx.handleExpandDivider()
    return
  }

  // A fenced block the cursor is in folds before the file does: a mermaid
  // fence is the thing in the way, and the file is what is left (spec 073).
  if (toggleBlockAtCursor(ctx)) return

  // In all-files mode, try to toggle file fold
  if (state.selectedFileIndex === null) {
    const currentLine = ctx.getLineMapping().getLine(ctx.getVimState().line)
    if (!currentLine) return

    const filename = currentLine.filename ?? getFilenameAtCursor(ctx)
    if (filename) {
      ctx.setState((s) => toggleFileFold(s, filename))
      ctx.rebuildLineMapping()
      const headerLine = findFileHeaderLine(ctx, filename)
      ctx.setVimState({ ...ctx.getVimState(), line: headerLine, col: 0 })
      ctx.render()
    }
  }
}

/**
 * The fenced block the cursor is in, folded or unfolded — answering whether
 * there was one (spec 073). The cursor stays on the fence, which is the row
 * that remains either way.
 */
function toggleBlockAtCursor(ctx: FoldsContext): boolean {
  const row = ctx.getVimState().line
  const block = ctx.getLineMapping().blockAtLine(row)
  if (!block) return false

  ctx.setState((s) => toggleBlockFold(s, block.id))
  ctx.rebuildLineMapping()
  ctx.setVimState({ ...ctx.getVimState(), line: block.start, col: 0, desiredCol: null })
  ctx.ensureCursorVisible()
  ctx.render()
  return true
}

/**
 * Every fenced block of the file under the cursor, folded or unfolded
 * together (`zA`) — a document that is mostly diagrams reads as prose.
 */
export function handleToggleFileBlocks(ctx: FoldsContext): void {
  const mapping = ctx.getLineMapping()
  const filename = mapping.getLine(ctx.getVimState().line)?.filename
  const blocks = mapping.foldableBlocks.filter(
    (block) => !filename || block.filename === filename
  )
  if (blocks.length === 0) return

  const state = ctx.getState()
  const anyOpen = blocks.some((block) => !state.collapsedBlocks.has(block.id))
  const ids = new Set(state.collapsedBlocks)
  for (const block of blocks) {
    if (anyOpen) ids.add(block.id)
    else ids.delete(block.id)
  }

  ctx.setState((s) => setBlockFolds(s, [...ids]))
  ctx.rebuildLineMapping()
  ctx.ensureCursorVisible()
  ctx.render()
}

/**
 * Open fold at cursor (zo)
 */
export function handleOpenFoldAtCursor(ctx: FoldsContext): void {
  const state = ctx.getState()

  if (state.focusedPanel === "tree") {
    const flatItems = getVisibleFlatTreeItems(state.fileTree, state.files, state.ignoredFiles, state.showHiddenFiles, state.treeFilter)
    const highlightedItem = flatItems[state.treeHighlightIndex]
    if (!highlightedItem) return

    if (highlightedItem.node.isDirectory && !highlightedItem.node.expanded) {
      const newTree = toggleNodeExpansion(state.fileTree, highlightedItem.node.path)
      ctx.setState((s) => updateFileTree(s, newTree))
      ctx.render()
    } else if (!highlightedItem.node.isDirectory) {
      for (let i = state.treeHighlightIndex - 1; i >= 0; i--) {
        const item = flatItems[i]
        if (item && item.node.isDirectory && item.depth < highlightedItem.depth) {
          if (!item.node.expanded) {
            const newTree = toggleNodeExpansion(state.fileTree, item.node.path)
            ctx.setState((s) => updateFileTree(s, newTree))
            ctx.render()
          }
          break
        }
      }
    }
    return
  }

  // A folded block under the cursor opens first (spec 073).
  const openBlock = ctx.getLineMapping().blockAtLine(ctx.getVimState().line)
  if (openBlock && state.collapsedBlocks.has(openBlock.id)) {
    toggleBlockAtCursor(ctx)
    return
  }

  // Diff view - expand file in all-files mode
  if (state.selectedFileIndex !== null) return

  const filename = getFilenameAtCursor(ctx)
  if (filename && state.collapsedFiles.has(filename)) {
    ctx.setState((s) => toggleFileFold(s, filename))
    ctx.rebuildLineMapping()
    const headerLine = findFileHeaderLine(ctx, filename)
    ctx.setVimState({ ...ctx.getVimState(), line: headerLine, col: 0 })
    ctx.render()
  }
}

/**
 * Close fold at cursor (zc)
 */
export function handleCloseFoldAtCursor(ctx: FoldsContext): void {
  const state = ctx.getState()

  if (state.focusedPanel === "tree") {
    const flatItems = getVisibleFlatTreeItems(state.fileTree, state.files, state.ignoredFiles, state.showHiddenFiles, state.treeFilter)
    const highlightedItem = flatItems[state.treeHighlightIndex]
    if (!highlightedItem) return

    if (highlightedItem.node.isDirectory && highlightedItem.node.expanded) {
      const newTree = toggleNodeExpansion(state.fileTree, highlightedItem.node.path)
      ctx.setState((s) => updateFileTree(s, newTree))
      ctx.render()
    } else if (!highlightedItem.node.isDirectory) {
      for (let i = state.treeHighlightIndex - 1; i >= 0; i--) {
        const item = flatItems[i]
        if (item && item.node.isDirectory && item.depth < highlightedItem.depth) {
          if (item.node.expanded) {
            const newTree = toggleNodeExpansion(state.fileTree, item.node.path)
            ctx.setState((s) => ({ ...updateFileTree(s, newTree), treeHighlightIndex: i }))
            ctx.render()
          }
          break
        }
      }
    }
    return
  }

  // An open block under the cursor closes first (spec 073).
  const closeBlock = ctx.getLineMapping().blockAtLine(ctx.getVimState().line)
  if (closeBlock && !state.collapsedBlocks.has(closeBlock.id)) {
    toggleBlockAtCursor(ctx)
    return
  }

  // Diff view - collapse file in all-files mode
  if (state.selectedFileIndex !== null) return

  const filename = getFilenameAtCursor(ctx)
  if (filename && !state.collapsedFiles.has(filename)) {
    ctx.setState((s) => toggleFileFold(s, filename))
    ctx.rebuildLineMapping()
    const headerLine = findFileHeaderLine(ctx, filename)
    ctx.setVimState({ ...ctx.getVimState(), line: headerLine, col: 0 })
    ctx.render()
  }
}

/**
 * Expand all folds (zR)
 */
export function handleExpandAllFolds(ctx: FoldsContext): void {
  const state = ctx.getState()

  if (state.focusedPanel === "tree") {
    const expandAll = (nodes: typeof state.fileTree): typeof state.fileTree => {
      return nodes.map((node) => ({
        ...node,
        expanded: node.isDirectory ? true : node.expanded,
        children: node.isDirectory ? expandAll(node.children) : node.children,
      }))
    }
    ctx.setState((s) => {
      const withTree = updateFileTree(s, expandAll(s.fileTree))
      return expandAllFiles(withTree)
    })
    ctx.rebuildLineMapping()
    ctx.render()
    return
  }

  // Diff view - expand all files, and every fenced block with them: "show
  // me everything" means everything (spec 073).
  const currentFilename = getFilenameAtCursor(ctx)
  ctx.setState((s) => expandAllBlocks(expandAllFiles(s)))
  ctx.rebuildLineMapping()
  if (currentFilename) {
    const headerLine = findFileHeaderLine(ctx, currentFilename)
    ctx.setVimState({ ...ctx.getVimState(), line: headerLine, col: 0 })
  } else {
    ctx.setVimState({ ...ctx.getVimState(), line: 0, col: 0 })
  }
  ctx.render()
}

/**
 * Collapse all folds (zM)
 */
export function handleCollapseAllFolds(ctx: FoldsContext): void {
  const state = ctx.getState()

  if (state.focusedPanel === "tree") {
    const collapseAll = (nodes: typeof state.fileTree): typeof state.fileTree => {
      return nodes.map((node) => ({
        ...node,
        expanded: node.isDirectory ? false : node.expanded,
        children: node.isDirectory ? collapseAll(node.children) : node.children,
      }))
    }
    ctx.setState((s) => {
      const withTree = updateFileTree(s, collapseAll(s.fileTree))
      return collapseAllFiles(withTree)
    })
    ctx.rebuildLineMapping()
    ctx.render()
    return
  }

  // Diff view - collapse all files, and fold every block, so opening one
  // file back up shows its prose rather than its diagrams (spec 073).
  const currentFilename = getFilenameAtCursor(ctx)
  const blockIds = ctx.getLineMapping().foldableBlocks.map((block) => block.id)
  ctx.setState((s) => setBlockFolds(collapseAllFiles(s), blockIds))
  ctx.rebuildLineMapping()
  if (currentFilename) {
    const headerLine = findFileHeaderLine(ctx, currentFilename)
    ctx.setVimState({ ...ctx.getVimState(), line: headerLine, col: 0 })
  } else {
    ctx.setVimState({ ...ctx.getVimState(), line: 0, col: 0 })
  }
  ctx.render()
}
