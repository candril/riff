import { describe, expect, test } from "bun:test"
import { createInitialState, type AppState } from "../../state"
import { createHelpState } from "../help/state"
import { adoptReloadedState } from "./handlers"

describe("a refresh's rebuilt state", () => {
  test("closes the help, which createInitialState no longer resets", () => {
    let state: AppState = createInitialState([], [], "local", "")
    const help = createHelpState()
    help.toggle()
    help.scrollBy(2, 10)
    const ctx = {
      getState: () => state,
      setState: (fn: (s: AppState) => AppState) => { state = fn(state) },
      help,
    }

    adoptReloadedState(ctx, (prev) => ({ ...createInitialState([], [], prev.source, "reloaded") }))

    expect(state.description).toBe("reloaded")
    expect([help.open(), help.scroll()]).toEqual([false, 0])
  })
})
