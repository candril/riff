import { test, expect } from "bun:test"
import { createInitialState, type AppState } from "../state"
import { prInfo } from "../testing/pr-info"
import { getAvailableActions } from "./registry"

const local = createInitialState([], [], "test", "")
const offersBoard = (state: AppState) => getAvailableActions(state, undefined, { reactionTarget: null }).some((a) => a.id === "open-in-board")

test("the palette offers Open in riff board once a PR has loaded", () => {
  expect(offersBoard({ ...local, appMode: "pr", prInfo: prInfo("") })).toBe(true)
})

test("the palette leaves Open in riff board out of a local review and a PR still loading", () => {
  expect(offersBoard(local)).toBe(false)
  expect(offersBoard({ ...local, appMode: "pr", prInfo: null })).toBe(false)
})
