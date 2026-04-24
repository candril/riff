/**
 * File picker input handling.
 *
 * The file picker captures all input when open. It provides fuzzy search
 * over files and selects the chosen file on Enter.
 */

import type { KeyEvent } from "@opentui/core"
import type { AppState } from "../../state"
import type { FilteredFile } from "../../components"
import {
  closeFilePicker,
  setFilePickerQuery,
  moveFilePickerSelection,
  selectFile,
  updateFileTree,
} from "../../state"
import { expandToFile, findFileTreeIndex } from "../../utils/file-tree"
import { fuzzyFilter } from "../../utils/fuzzy"

export interface FilePickerInputContext {
  readonly state: AppState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
  // Called after file selection to reset vim state and rebuild mapping
  onFileSelected: () => void
  // Push current location onto the jumplist before navigating (spec 038).
  recordJump?: () => void
}

/**
 * Build the list of filtered files for the picker.
 */
export function getFilteredFiles(state: AppState): FilteredFile[] {
  const allFiles: FilteredFile[] = state.files.map((file, index) => {
    const viewed = state.fileStatuses.get(file.filename)?.viewed ?? false
    const commentCount = state.comments.filter((c) => c.filename === file.filename).length
    return { file, index, viewed, commentCount }
  })

  return state.filePicker.query
    ? fuzzyFilter(state.filePicker.query, allFiles, (f) => [f.file.filename])
    : allFiles
}

/**
 * Handle input when file picker is open.
 * Returns true if the key was handled (picker is open), false otherwise.
 */
export function handleInput(
  key: KeyEvent,
  ctx: FilePickerInputContext
): boolean {
  if (!ctx.state.filePicker.open) {
    return false
  }

  const filteredFiles = getFilteredFiles(ctx.state)

  switch (key.name) {
    case "escape":
      ctx.setState(closeFilePicker)
      ctx.render()
      return true

    case "return":
    case "enter": {
      const selectedFile = filteredFiles[ctx.state.filePicker.selectedIndex]
      if (selectedFile) {
        ctx.recordJump?.()
        ctx.setState((s) => {
          let newState = closeFilePicker(s)

          // Expand tree to show the selected file
          const filename = s.files[selectedFile.index]?.filename
          if (filename) {
            const expandedTree = expandToFile(s.fileTree, filename)
            newState = updateFileTree(newState, expandedTree)

            // Find and set the tree highlight index
            const treeIndex = findFileTreeIndex(expandedTree, s.files, filename)
            if (treeIndex !== -1) {
              newState = { ...newState, treeHighlightIndex: treeIndex }
            }
          }

          // Select the file
          newState = selectFile(newState, selectedFile.index)
          return newState
        })

        // Reset vim cursor and rebuild line mapping
        ctx.onFileSelected()
        ctx.render()
      }
      return true
    }

    case "up":
      ctx.setState((s) => moveFilePickerSelection(s, -1, filteredFiles.length - 1))
      ctx.render()
      return true

    case "down":
      ctx.setState((s) => moveFilePickerSelection(s, 1, filteredFiles.length - 1))
      ctx.render()
      return true

    case "p":
      // Ctrl+p moves up
      if (key.ctrl) {
        ctx.setState((s) => moveFilePickerSelection(s, -1, filteredFiles.length - 1))
        ctx.render()
        return true
      }
      // Otherwise type 'p'
      ctx.setState((s) => setFilePickerQuery(s, s.filePicker.query + "p"))
      ctx.render()
      return true

    case "n":
      // Ctrl+n moves down
      if (key.ctrl) {
        ctx.setState((s) => moveFilePickerSelection(s, 1, filteredFiles.length - 1))
        ctx.render()
        return true
      }
      // Otherwise type 'n'
      ctx.setState((s) => setFilePickerQuery(s, s.filePicker.query + "n"))
      ctx.render()
      return true

    case "backspace":
      if (ctx.state.filePicker.query.length > 0) {
        ctx.setState((s) => setFilePickerQuery(s, s.filePicker.query.slice(0, -1)))
        ctx.render()
      }
      return true

    default:
      // Type characters into search
      if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
        ctx.setState((s) => setFilePickerQuery(s, s.filePicker.query + key.sequence))
        ctx.render()
      }
      // Capture all keys when picker is open
      return true
  }
}
