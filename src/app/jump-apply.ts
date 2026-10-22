import type { JumpApplyContext } from "../features/jumplist"
import type { AppKeyContext } from "./key-context"

export function jumpApplyContext(
  ctx: Pick<
    AppKeyContext,
    | "setState"
    | "getVimState"
    | "setVimState"
    | "getLineMapping"
    | "rebuildLineMapping"
    | "setPane"
    | "ensureCursorVisible"
    | "render"
    | "onCommitSelected"
  >,
): JumpApplyContext {
  return {
    setState: ctx.setState,
    getVimState: ctx.getVimState,
    setVimState: ctx.setVimState,
    getLineMapping: ctx.getLineMapping,
    setPane: ctx.setPane,
    rebuildLineMapping: ctx.rebuildLineMapping,
    ensureCursorVisible: ctx.ensureCursorVisible,
    render: ctx.render,
    onCommitSelected: ctx.onCommitSelected,
  }
}
