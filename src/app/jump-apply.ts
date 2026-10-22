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
    | "ensureCursorVisible"
    | "render"
    | "onCommitSelected"
  >,
): JumpApplyContext {
  return {
    getState: ctx.getState,
    setState: ctx.setState,
    getVimState: ctx.getVimState,
    setVimState: ctx.setVimState,
    getLineMapping: ctx.getLineMapping,
    setPane: ctx.setPane,
    toggleSplitView: ctx.toggleSplitView,
    rebuildLineMapping: ctx.rebuildLineMapping,
    ensureCursorVisible: ctx.ensureCursorVisible,
    render: ctx.render,
    onCommitSelected: ctx.onCommitSelected,
  }
}
