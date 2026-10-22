import type { AppKeyContext } from "./key-context"
import { createCursorState } from "../vim-diff/cursor-state"
import { handleInput, type FileTreeInputContext } from "../features/file-tree"
import type { TreeKeyDeps } from "../features/file-tree/keys"
import * as fileNavigation from "../features/file-navigation"

/** `state` is a snapshot, so build this for every key rather than keep one. */
export function treeInputContext(ctx: AppKeyContext): FileTreeInputContext {
  return {
    state: ctx.getState(),
    setState: ctx.setState,
    render: ctx.render,
    getPanel: () => ctx.fileTreePanel,
    updatePanel: ctx.updateFileTreePanel,
    onFileSelected: () => {
      ctx.setVimState(createCursorState())
      ctx.rebuildLineMapping()
    },
    revealFile: (fileIndex: number) =>
      fileNavigation.revealFile(fileIndex, ctx.fileNavContext),
    toggleViewedForFile: (filename: string) =>
      fileNavigation.toggleViewedForFile(filename, ctx.fileNavContext),
    toggleUnviewedOnly: ctx.toggleUnviewedFilesOnly,
  }
}

/** What the tree's keys need of the app, and whether a chord is pending, which they give way to. */
export function treeKeyDeps(
  ctx: AppKeyContext,
  chord: { chordPending(): boolean },
): TreeKeyDeps {
  return {
    getState: ctx.getState,
    handle: (key) => handleInput(key, treeInputContext(ctx)),
    chord,
  }
}
