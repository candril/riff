import type { AppState } from "../state"
import { composerOpen } from "./diff-focus"

export interface ComposerModel {
  key: string
  initialValue: string
  mode: "compose" | "edit"
}

/** What the comment composer's textarea holds and how it is keyed, or null while it is not composing. */
export function composerModel(state: AppState): ComposerModel | null {
  if (!composerOpen(state)) return null
  const ov = state.inlineCommentOverlay
  return {
    key: `${ov.filename}:${ov.line}:${ov.mode}:${ov.editingId ?? ""}`,
    initialValue: ov.input,
    mode: ov.mode as ComposerModel["mode"],
  }
}
