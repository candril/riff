import type { AppKeyContext } from "./key-context"
import type { BlameKeysContext } from "../features/blame/keys"
import type { BlameColumnKeysContext } from "../features/blame/column-keys"

/** What `gB`, its peek and the `gb` blame column need of the app. */
export function blameKeysContext(ctx: AppKeyContext): BlameKeysContext & Pick<BlameColumnKeysContext, "columns"> {
  return {
    deps: ctx.blame,
    getState: ctx.getState,
    setState: ctx.setState,
    peek: ctx.blamePeek,
    columns: ctx.blameColumns,
    getLineMapping: ctx.getLineMapping,
    getVimState: ctx.getVimState,
    render: ctx.render,
    toast(message, type) {
      ctx.toast.show(message, type)
      ctx.render()
      setTimeout(() => {
        ctx.toast.clear()
        ctx.render()
      }, 2000)
    },
  }
}
