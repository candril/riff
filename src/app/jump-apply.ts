import type { JumpApplyContext } from "../features/jumplist"
import type { AppKeyContext } from "./key-context"

export function jumpApplyContext(
  ctx: Pick<
    AppKeyContext,
    | "getState"
    | "setState"
    | "getVimState"
    | "setVimState"
    | "getLineMapping"
    | "rebuildLineMapping"
    | "setPane"
    | "toggleSplitView"
    | "diffOptions"
    | "blockFolds"
    | "chat"
    | "ensureCursorVisible"
    | "render"
    | "onCommitSelected"
  >,
): JumpApplyContext {
  return {
    getState: ctx.getState,
    setState: ctx.setState,
    blockFolds: ctx.blockFolds,
    chatColumn: ctx.chat.column,
    getVimState: ctx.getVimState,
    setVimState: ctx.setVimState,
    getLineMapping: ctx.getLineMapping,
    setPane: ctx.setPane,
    splitView: () => ctx.diffOptions.splitView(),
    toggleSplitView: ctx.toggleSplitView,
    rebuildLineMapping: ctx.rebuildLineMapping,
    ensureCursorVisible: ctx.ensureCursorVisible,
    render: ctx.render,
    onCommitSelected: ctx.onCommitSelected,
  }
}
