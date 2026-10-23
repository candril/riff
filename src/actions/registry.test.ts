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

const offered = (state: AppState) =>
  getAvailableActions(state, undefined, { reactionTarget: null })
    .map((a) => a.id)
    .filter((id) => id === "mark-ready" || id === "mark-draft")

test("the palette offers Mark Ready for Review only on a draft, and Convert to Draft only on an open PR that is not one", () => {
  const pr = (extra: Parameters<typeof prInfo>[1]) => ({ ...local, appMode: "pr" as const, prInfo: prInfo("", extra) })
  expect(offered(pr({ isDraft: true }))).toEqual(["mark-ready"])
  expect(offered(pr({ isDraft: false }))).toEqual(["mark-draft"])
  expect(offered(pr({ state: "merged" }))).toEqual([])
  expect(offered(pr({ state: "closed" }))).toEqual([])
})

test("neither ready nor draft is offered outside a PR", () => {
  expect(offered(local)).toEqual([])
  expect(offered({ ...local, prInfo: prInfo("", { isDraft: true }) })).toEqual([])
})
