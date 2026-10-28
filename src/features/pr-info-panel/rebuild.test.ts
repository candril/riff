import { expect, mock, test } from "bun:test"
import type { PRInfoPanelSection } from "../../state"
import { commentPollRebuild, rereadsLookups, sectionsForRebuild, type RecreatePrInfoPanel } from "./rebuild"

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

test("the first panel built after startup opens the sections saved for the review, and a rebuild keeps what it is handed", () => {
  const saved: ReadonlySet<PRInfoPanelSection> = new Set(["checks"])
  const handed: ReadonlySet<PRInfoPanelSection> = new Set(["files"])
  expect(sectionsForRebuild(undefined, { hadPanel: false, saved })).toBe(saved)
  expect(sectionsForRebuild(handed, { hadPanel: false, saved })).toBe(handed)
  expect(sectionsForRebuild(undefined, { hadPanel: true, saved })).toBeUndefined()
  expect(sectionsForRebuild(handed, { hadPanel: true, saved })).toBe(handed)
})
