import { describe, expect, test } from "bun:test"
import { executeAction, type ActionHandlers } from "./execute"
import { getAvailableActions } from "../../actions/registry"
import { createInitialState, toggleThreadPanelOpenOnly, type AppState } from "../../state"
import type { Comment } from "../../types"

const COMMENT: Comment = {
  id: "c1",
  filename: "src/a.ts",
  line: 1,
  side: "RIGHT",
  body: "a thread",
  createdAt: "2026-01-01T00:00:00Z",
  status: "synced",
}

describe("Show Only Open Threads", () => {
  test("is offered once there are threads to hide", () => {
    const base = createInitialState([], [], "local", "local changes")
    const ids = (state: AppState) => getAvailableActions(state).map((action) => action.id)
    expect(ids(base)).not.toContain("toggle-open-threads-only")
    expect(ids({ ...base, comments: [COMMENT] })).toContain("toggle-open-threads-only")
  })

  test("goes through the same toggle as H, and flips the flag each time", async () => {
    let state: AppState = { ...createInitialState([], [], "local", "local changes"), comments: [COMMENT] }
    let saves = 0
    const handlers = {
      handleToggleOpenThreadsOnly: () => {
        state = toggleThreadPanelOpenOnly(state)
        saves++
      },
    } as unknown as ActionHandlers
    const run = () =>
      executeAction("toggle-open-threads-only", {
        state,
        setState: (update) => (state = update(state)),
        render: () => {},
        handlers,
      })

    await run()
    expect(state.threadPanelOpenOnly).toBe(true)
    await run()
    expect(state.threadPanelOpenOnly).toBe(false)
    expect(saves).toBe(2)
  })
})
