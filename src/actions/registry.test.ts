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

const merges = (state: AppState) =>
  getAvailableActions(state, undefined, { reactionTarget: null })
    .map((a) => a.id)
    .filter((id) => id.startsWith("merge-"))

test("the palette offers one merge per method the repository allows, whatever GitHub thinks of the PR", () => {
  const pr = (extra: Parameters<typeof prInfo>[1]) => ({ ...local, appMode: "pr" as const, prInfo: prInfo("", extra) })
  expect(merges(pr({ mergeMethods: ["squash", "merge", "rebase"] }))).toEqual(["merge-squash", "merge-commit", "merge-rebase"])
  expect(merges(pr({ mergeMethods: ["rebase"], mergeStateStatus: "DIRTY", isDraft: true }))).toEqual(["merge-rebase"])
  expect(merges(pr({ mergeMethods: [] }))).toEqual([])
  expect(merges(pr({}))).toEqual([])
})

test("the palette offers Update Branch on an open PR whatever its merge state, and nowhere else", () => {
  const offersUpdate = (state: AppState) =>
    getAvailableActions(state, undefined, { reactionTarget: null }).some((a) => a.id === "update-branch")
  const pr = (extra: Parameters<typeof prInfo>[1]) => ({ ...local, appMode: "pr" as const, prInfo: prInfo("", extra) })
  expect(offersUpdate(pr({ mergeStateStatus: "BEHIND" }))).toBe(true)
  expect(offersUpdate(pr({ mergeStateStatus: "CLEAN" }))).toBe(true)
  expect(offersUpdate(pr({ state: "merged" }))).toBe(false)
  expect(offersUpdate(pr({ state: "closed" }))).toBe(false)
  expect(offersUpdate({ ...local, prInfo: prInfo("") })).toBe(false)
})

test("no merge is offered on a merged or closed PR, or outside a PR", () => {
  const all = (extra: Parameters<typeof prInfo>[1] = {}) => prInfo("", { mergeMethods: ["squash", "merge", "rebase"], ...extra })
  expect(merges({ ...local, appMode: "pr", prInfo: all({ state: "merged" }) })).toEqual([])
  expect(merges({ ...local, appMode: "pr", prInfo: all({ state: "closed" }) })).toEqual([])
  expect(merges({ ...local, prInfo: all() })).toEqual([])
})

test("the palette offers auto-merge per allowed method only on an open PR with no queue, no armed auto-merge and the repository's leave", () => {
  const autoMerges = (state: AppState) =>
    getAvailableActions(state, undefined, { reactionTarget: null })
      .map((a) => a.id)
      .filter((id) => id.startsWith("auto-merge-"))
  const pr = (extra: Parameters<typeof prInfo>[1] = {}) => ({
    ...local,
    appMode: "pr" as const,
    prInfo: prInfo("", { mergeMethods: ["squash", "rebase"], autoMergeMethod: null, ...extra }),
  })
  const queue = { entry: null, inQueue: false, removal: null }
  expect(autoMerges(pr())).toEqual(["auto-merge-squash", "auto-merge-rebase"])
  expect(autoMerges(pr({ autoMergeAllowed: true }))).toEqual(["auto-merge-squash", "auto-merge-rebase"])
  expect(autoMerges(pr({ autoMergeAllowed: false }))).toEqual([])
  expect(autoMerges(pr({ autoMergeMethod: "squash" }))).toEqual([])
  expect(autoMerges(pr({ mergeQueue: queue }))).toEqual([])
  expect(autoMerges(pr({ state: "closed" }))).toEqual([])
  expect(autoMerges({ ...pr(), appMode: "local" })).toEqual([])
})

test("the palette offers Disable Auto-Merge only while it is armed, and the queue actions by the PR's place in it", () => {
  const offers = (state: AppState) =>
    getAvailableActions(state, undefined, { reactionTarget: null })
      .map((a) => a.id)
      .filter((id) => id === "disable-auto-merge" || id.startsWith("merge-queue-"))
  const pr = (extra: Parameters<typeof prInfo>[1] = {}) => ({ ...local, appMode: "pr" as const, prInfo: prInfo("", extra) })
  const queue = { entry: null, inQueue: false, removal: null }
  expect(offers(pr())).toEqual([])
  expect(offers(pr({ autoMergeMethod: "merge" }))).toEqual(["disable-auto-merge"])
  expect(offers(pr({ autoMergeMethod: "merge", state: "merged" }))).toEqual([])
  expect(offers(pr({ mergeQueue: queue }))).toEqual(["merge-queue-add"])
  expect(offers(pr({ mergeQueue: { ...queue, inQueue: true } }))).toEqual(["merge-queue-remove"])
  expect(offers(pr({ mergeQueue: queue, state: "closed" }))).toEqual([])
})
