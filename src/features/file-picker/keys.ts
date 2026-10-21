/**
 * File picker keys. Enter selects the chosen file and expands the tree to it.
 */

import type { RiffKeymap } from "../../app/keymap"
import { registerQueryPickerKeys } from "../../app/query-picker-keys"
import type { AppState } from "../../state"
import {
  closeFilePicker,
  keepTreeFile,
  moveFilePickerSelection,
  selectFile,
  updateFileTree,
} from "../../state"
import { treeRowsOf } from "../../components/FileTree"
import { expandToFile } from "../../utils/file-tree"
import { getFilteredFiles } from "./filter"

export interface FilePickerKeyDeps {
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
  /** After a pick in the single-file view, to reset the cursor and rebuild the mapping. */
  onFileSelected: () => void
  /** Scroll the all-files diff to a file instead of narrowing to it. */
  revealFile: (fileIndex: number) => void
}

export function registerFilePickerKeys(riffKeymap: RiffKeymap, deps: FilePickerKeyDeps): () => void {
  const pick = () => {
    const state = deps.getState()
    const selectedFile = getFilteredFiles(state)[state.filePicker.selectedIndex]
    if (!selectedFile) return
    deps.setState((s) => {
      let newState = closeFilePicker(s)

      const filename = s.files[selectedFile.index]?.filename
      if (filename) {
        newState = updateFileTree(newState, expandToFile(s.fileTree, filename))
        // A picked viewed file would otherwise stay hidden, as `]f` keeps its own.
        if (newState.treeUnviewedOnly) newState = keepTreeFile(newState, filename)

        const treeIndex = treeRowsOf(newState).findIndex((item) => item.node.file?.filename === filename)
        if (treeIndex !== -1) {
          newState = { ...newState, treeHighlightIndex: treeIndex }
        }
      }

      // Already reviewing one file alone: swap which one, rather than
      // dropping the user back into the whole diff.
      return s.selectedFileIndex !== null ? selectFile(newState, selectedFile.index) : newState
    })

    if (state.selectedFileIndex !== null) {
      deps.onFileSelected()
      deps.render()
    } else {
      deps.revealFile(selectedFile.index)
    }
  }

  return registerQueryPickerKeys(riffKeymap, {
    name: "filePicker",
    category: "File picker",
    active: () => deps.getState().filePicker.open,
    close: () => {
      deps.setState(closeFilePicker)
      deps.render()
    },
    pick,
    move: (delta) => {
      // Read at run time, so the bound is the list on screen.
      const maxIndex = getFilteredFiles(deps.getState()).length - 1
      deps.setState((s) => moveFilePickerSelection(s, delta, maxIndex))
      deps.render()
    },
  })
}
