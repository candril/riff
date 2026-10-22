import type { JumpApplyContext } from "../features/jumplist"
import type { AppKeyContext } from "./key-context"

export function jumpApplyContext(
  ctx: Pick<
    AppKeyContext,
    "setState" | "getVimState" | "setVimState" | "rebuildLineMapping" | "ensureCursorVisible" | "render" | "onCommitSelected"
  >,
): JumpApplyContext {
  return {
    setState: ctx.setState,
    getVimState: ctx.getVimState,
    setVimState: ctx.setVimState,
    rebuildLineMapping: ctx.rebuildLineMapping,
    ensureCursorVisible: ctx.ensureCursorVisible,
    render: ctx.render,
    onCommitSelected: ctx.onCommitSelected,
  }
}
