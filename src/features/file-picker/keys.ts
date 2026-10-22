/**
 * File picker keys. Enter selects the chosen file and expands the tree to it.
 */

import type { RiffKeymap } from "../../app/keymap"
import { registerQueryPickerKeys } from "../../app/query-picker-keys"
import type { AppState } from "../../state"
import { keepTreeFile, selectFile, updateFileTree } from "../../state"
import { treeRowsOf } from "../../components/FileTree"
import { expandToFile } from "../../utils/file-tree"
import { getFilteredFiles } from "./filter"
import type { FilePickerState } from "./state"

export interface FilePickerKeyDeps {
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  /** The file picker's state, the same instance the frame pass reads. */
  filePicker: FilePickerState
  render: () => void
  /** After a pick in the single-file view, to reset the cursor and rebuild the mapping. */
  onFileSelected: () => void
  /** Scroll the all-files diff to a file instead of narrowing to it. */
  revealFile: (fileIndex: number) => void
}

export function registerFilePickerKeys(riffKeymap: RiffKeymap, deps: FilePickerKeyDeps): () => void {
  const pick = () => {
    const state = deps.getState()
    const selectedFile = getFilteredFiles(state, deps.filePicker.query())[deps.filePicker.selectedIndex()]
    if (!selectedFile) return
    deps.filePicker.close()
    deps.setState((s) => {
      let newState = s

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
    active: () => deps.filePicker.open(),
    close: () => {
      deps.filePicker.close()
      deps.render()
    },
    pick,
    move: (delta) => {
      // Read at run time, so the bound is the list on screen.
      const maxIndex = getFilteredFiles(deps.getState(), deps.filePicker.query()).length - 1
      deps.filePicker.move(delta, maxIndex)
      deps.render()
    },
  })
}
