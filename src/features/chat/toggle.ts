import type { AppState } from "../../state"
import type { ChatColumnState } from "./column-state"

/** `Ctrl-r`: opens the chat and gives it the keys, focuses it when open elsewhere, and closes it from inside. */
export function toggleChat(state: AppState, column: ChatColumnState): AppState {
  if (column.open() && state.focusedPanel === "chat") {
    column.hide()
    return { ...state, focusedPanel: "diff" }
  }
  column.show()
  return { ...state, focusedPanel: "chat" }
}
