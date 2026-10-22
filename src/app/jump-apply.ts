import type { JumpApplyContext } from "../features/jumplist"
import type { GlobalKeyContext } from "./global-keys"

export function jumpApplyContext(
  ctx: Pick<
    GlobalKeyContext,
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
