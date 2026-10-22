import { expect, mock, test } from "bun:test"
import { commentPollRebuild, rereadsLookups, type RecreatePrInfoPanel } from "./rebuild"

test("a comment poll rebuilds the panel without running the lookups again", () => {
  const recreate = mock<RecreatePrInfoPanel>(() => {})
  commentPollRebuild(recreate)()
  expect(recreate).toHaveBeenCalledWith(undefined, { reread: false })
})

test("only a rebuild that keeps answers skips the lookups, and only when there were answers to keep", () => {
  expect(rereadsLookups(undefined, { hadPanel: true })).toBe(true)
  expect(rereadsLookups({ reread: false }, { hadPanel: true })).toBe(false)
  expect(rereadsLookups({ reread: false }, { hadPanel: false })).toBe(true)
})
