import { describe, expect, test } from "bun:test"
import { createInitialState, type AppState } from "../../state"
import { createChatColumnState } from "./column-state"
import { toggleChat } from "./toggle"

const localState = (): AppState => createInitialState([], [], "local", "")
const at = (focusedPanel: AppState["focusedPanel"]): AppState => ({ ...localState(), focusedPanel })

describe("Ctrl-r", () => {
  test("opens a closed chat and gives it the keys", () => {
    const column = createChatColumnState()
    const opened = toggleChat(localState(), column)
    expect([column.open(), opened.focusedPanel]).toEqual([true, "chat"])
  })

  test("focuses an open chat from wherever the keys are", () => {
    for (const panel of ["tree", "diff", "comments"] as const) {
      const column = createChatColumnState()
      column.show()
      const focused = toggleChat(at(panel), column)
      expect([column.open(), focused.focusedPanel]).toEqual([true, "chat"])
    }
  })

  test("closes the chat from inside it and hands the keys to the diff", () => {
    const column = createChatColumnState()
    const closed = toggleChat(toggleChat(localState(), column), column)
    expect([column.open(), closed.focusedPanel]).toEqual([false, "diff"])
  })

  test("a chat focused while its column is shut opens rather than closes", () => {
    const column = createChatColumnState()
    const opened = toggleChat(at("chat"), column)
    expect([column.open(), opened.focusedPanel]).toEqual([true, "chat"])
  })
})
