import type { AppKeyContext } from "./key-context"
import type { BlameKeysContext } from "../features/blame/keys"
import type { BlameColumnKeysContext } from "../features/blame/column-keys"
import { clearToast, showToast } from "../state"

/** What `gb`, its peek and the blame column need of the app. */
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
      ctx.setState((s) => showToast(s, message, type))
      ctx.render()
      setTimeout(() => {
        ctx.setState(clearToast)
        ctx.render()
      }, 2000)
    },
  }
}
