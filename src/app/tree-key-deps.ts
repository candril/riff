import type { GlobalKeyContext } from "./global-keys"
import { createCursorState } from "../vim-diff/cursor-state"
import { handleInput, type FileTreeInputContext } from "../features/file-tree"
import type { TreeKeyDeps } from "../features/file-tree/keys"
import * as fileNavigation from "../features/file-navigation"

/** `state` is a snapshot, so build this for every key rather than keep one. */
export function treeInputContext(ctx: GlobalKeyContext): FileTreeInputContext {
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

/** What the tree's keys need of the app, and of the chain behind them, the chord it holds. */
export function treeKeyDeps(
  ctx: GlobalKeyContext,
  chain: { chordPending(): boolean },
): TreeKeyDeps {
  return {
    getState: ctx.getState,
    handle: (key) => handleInput(key, treeInputContext(ctx)),
    chain,
  }
}
