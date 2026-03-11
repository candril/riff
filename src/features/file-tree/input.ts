/**
 * File Tree input handling.
 *
 * Handles navigation and actions in the file tree panel.
 */

import type { KeyEvent } from "@opentui/core"
import type { AppState } from "../../state"
import type { FileTreePanel } from "../../components/FileTreePanel"
import { getVisibleFlatTreeItems } from "../../components"
import {
  moveTreeHighlight,
  updateFileTree,
  selectFile,
  clearFileSelection,
  isFileViewed,
} from "../../state"
import { toggleNodeExpansion } from "../../utils/file-tree"

export interface FileTreeInputContext {
  readonly state: AppState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
  // File tree panel instance
  getPanel: () => FileTreePanel
  // Update panel after state change
  updatePanel: () => void
  // Called after file selection to reset vim state
  onFileSelected: () => void
  // Toggle viewed status for a file
  toggleViewedForFile: (filename: string) => Promise<boolean>
}

/**
 * Handle input when file tree panel is focused.
 * Returns true if the key was handled, false otherwise.
 */
export function handleInput(
  key: KeyEvent,
  ctx: FileTreeInputContext
): boolean {
  if (!ctx.state.showFilePanel || ctx.state.focusedPanel !== "tree") {
    return false
  }

  const flatItems = getVisibleFlatTreeItems(
    ctx.state.fileTree,
    ctx.state.files,
    ctx.state.ignoredFiles,
    ctx.state.showHiddenFiles
  )
  const panel = ctx.getPanel()

  switch (key.name) {
    case "j":
    case "down":
      ctx.setState((s) => moveTreeHighlight(s, 1, flatItems.length - 1))
      ctx.updatePanel()
      panel.ensureHighlightVisible()
      return true

    case "k":
    case "up":
      ctx.setState((s) => moveTreeHighlight(s, -1, flatItems.length - 1))
      ctx.updatePanel()
      panel.ensureHighlightVisible()
      return true

    case "return":
    case "enter": {
      const highlightedItem = flatItems[ctx.state.treeHighlightIndex]
      if (highlightedItem) {
        if (highlightedItem.node.isDirectory) {
          ctx.setState((s) => {
            const newTree = toggleNodeExpansion(s.fileTree, highlightedItem.node.path)
            return updateFileTree(s, newTree)
          })
        } else if (typeof highlightedItem.fileIndex === "number") {
          ctx.setState((s) => {
            const selected = selectFile(s, highlightedItem.fileIndex!)
            return { ...selected, focusedPanel: s.viewMode === "diff" ? "diff" as const : "comments" as const }
          })
          ctx.onFileSelected()
          setTimeout(() => {
            ctx.render() // Re-render to update VimDiffView
          }, 0)
        }
      }
      ctx.render()
      return true
    }

    case "l":
    case "right": {
      const expandItem = flatItems[ctx.state.treeHighlightIndex]
      if (expandItem?.node.isDirectory && !expandItem.node.expanded) {
        ctx.setState((s) => {
          const newTree = toggleNodeExpansion(s.fileTree, expandItem.node.path)
          return updateFileTree(s, newTree)
        })
        ctx.render()
      }
      return true
    }

    case "h":
    case "left": {
      const collapseItem = flatItems[ctx.state.treeHighlightIndex]
      if (collapseItem?.node.isDirectory && collapseItem.node.expanded) {
        // Collapse this directory
        ctx.setState((s) => {
          const newTree = toggleNodeExpansion(s.fileTree, collapseItem.node.path)
          return updateFileTree(s, newTree)
        })
        ctx.render()
      } else if (collapseItem && !collapseItem.node.isDirectory) {
        // On a file - find parent directory and collapse it
        for (let i = ctx.state.treeHighlightIndex - 1; i >= 0; i--) {
          const item = flatItems[i]
          if (item && item.node.isDirectory && item.depth < collapseItem.depth) {
            ctx.setState((s) => {
              const newTree = toggleNodeExpansion(s.fileTree, item.node.path)
              return { ...updateFileTree(s, newTree), treeHighlightIndex: i }
            })
            ctx.render()
            break
          }
        }
      }
      return true
    }

    case "escape":
      ctx.setState((s) => {
        const cleared = clearFileSelection(s)
        return { ...cleared, focusedPanel: s.viewMode === "diff" ? "diff" as const : "comments" as const }
      })
      ctx.onFileSelected()
      ctx.render()
      setTimeout(() => {
        ctx.render() // Re-render to update VimDiffView
      }, 0)
      return true

    case "v": {
      // Toggle viewed status for highlighted item
      const viewItem = flatItems[ctx.state.treeHighlightIndex]
      if (!viewItem) return true

      if (viewItem.node.isDirectory) {
        // Directory: toggle viewed for all files under this directory
        const dirPath = viewItem.node.path + "/"
        const filesToToggle = ctx.state.files.filter((f) => f.filename.startsWith(dirPath))

        if (filesToToggle.length > 0) {
          // Check if any file in dir is unviewed - if so, mark all as viewed
          const anyUnviewed = filesToToggle.some((f) => !isFileViewed(ctx.state, f.filename))
          const targetViewed = anyUnviewed

          Promise.all(
            filesToToggle.map((f) => {
              const currentlyViewed = isFileViewed(ctx.state, f.filename)
              if (currentlyViewed !== targetViewed) {
                return ctx.toggleViewedForFile(f.filename)
              }
              return Promise.resolve(currentlyViewed)
            })
          ).then(() => {
            ctx.render()
          })
        }
      } else if (viewItem.fileIndex !== undefined) {
        // File: toggle viewed for this file only
        const file = ctx.state.files[viewItem.fileIndex]
        if (file) {
          ctx.toggleViewedForFile(file.filename).then(() => {
            ctx.render()
          })
        }
      }
      return true
    }
  }

  return false
}
