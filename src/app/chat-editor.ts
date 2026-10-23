import type { AppKeyContext } from "./key-context"
import { openTextInEditor } from "../utils/editor/spawn"

/** The chat's Ctrl-g: the question as plain text in $EDITOR, with riff's screen handed over while it runs. */
export function openQuestionInEditor(ctx: Pick<AppKeyContext, "externalToolsContext">) {
  return async (current: string): Promise<string | null> => {
    ctx.externalToolsContext.suspendRenderer()
    try {
      return await openTextInEditor(current)
    } finally {
      ctx.externalToolsContext.resumeRenderer()
    }
  }
}
