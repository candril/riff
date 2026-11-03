import { expect, test } from "bun:test"
import { handleOpenPRInfoPanel, handleOpenPreviews } from "./handlers"
import { createPrCommentInputState } from "./comment-input-state"
import { createPrInfoFilterState } from "./filter-state"
import { createInitialState, type AppState } from "../../state"
import { prInfo } from "../../testing/pr-info"

test("entering the overview closes a comment prompt left open, and drops its text", async () => {
  let state: AppState = { ...createInitialState([], [], "test", ""), appMode: "pr", prInfo: prInfo("A body") }
  const commentInput = createPrCommentInputState()
  commentInput.open()
  commentInput.setText("half a thought")

  await handleOpenPRInfoPanel({
    getState: () => state,
    setState: (update) => {
      state = update(state)
    },
    render() {},
    commentInput,
    prInfoFilter: createPrInfoFilterState(),
  })

  expect(state.viewMode).toBe("state")
  expect(commentInput.current()).toEqual({ open: false, text: "", loading: false, error: null })
})

test("entering the overview drops a filter left from the visit before, and closes its prompt", async () => {
  let state: AppState = { ...createInitialState([], [], "test", ""), appMode: "pr", prInfo: prInfo("A body") }
  const prInfoFilter = createPrInfoFilterState()
  prInfoFilter.start()
  prInfoFilter.set("greet")

  await handleOpenPRInfoPanel({
    getState: () => state,
    setState: (update) => {
      state = update(state)
    },
    render() {},
    commentInput: createPrCommentInputState(),
    prInfoFilter,
  })

  expect(state.viewMode).toBe("state")
  expect({ filter: prInfoFilter.filter(), filterInput: prInfoFilter.filterInput() }).toEqual({ filter: "", filterInput: false })
})

test("gp enters the overview standing on the previews; outside a PR it does nothing", () => {
  let state: AppState = { ...createInitialState([], [], "test", ""), appMode: "pr", prInfo: prInfo("A body") }
  const focused: string[] = []
  const ctx = {
    getState: () => state,
    setState: (update: (s: AppState) => AppState) => {
      state = update(state)
    },
    render() {},
    commentInput: createPrCommentInputState(),
    prInfoFilter: createPrInfoFilterState(),
    getPanel: () => ({ focusSection: (section: string) => void focused.push(section) }),
  }

  handleOpenPreviews(ctx)
  expect([state.viewMode, focused]).toEqual(["state", ["previews"]])

  state = { ...state, appMode: "local", viewMode: "diff" }
  handleOpenPreviews(ctx)
  expect([state.viewMode, focused]).toEqual(["diff", ["previews"]])
})
