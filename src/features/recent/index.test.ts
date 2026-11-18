import { expect, test } from "bun:test"
import type { PrInfo } from "../../providers/github/types"
import { recentReviewFor } from "."

const now = new Date("2026-11-18T10:00:00.000Z")
const prInfo = {
  number: 7, title: "Fix it", owner: "acme", repo: "app", url: "https://github.com/acme/app/pull/7",
} as PrInfo

test("a PR review is recorded with what reopening and listing it need", () => {
  expect(recentReviewFor({ mode: "pr", prInfo }, "/src/app", now)).toEqual({
    kind: "pr", url: prInfo.url, owner: "acme", repo: "app", number: 7, title: "Fix it",
    directory: "/src/app", openedAt: "2026-11-18T10:00:00.000Z",
  })
})

test("a local review keeps the target as typed, a path as given", () => {
  expect(recentReviewFor({ mode: "local" }, "/src/app", now)).toMatchObject({ kind: "local", target: null })
  expect(recentReviewFor({ mode: "local", target: "main..HEAD" }, "/src/app", now)).toMatchObject({ target: "main..HEAD" })
  expect(recentReviewFor({ mode: "local", filesTarget: { path: "src/", directory: true } }, "/src/app", now))
    .toMatchObject({ target: "src/", directory: "/src/app" })
})

test("the demo is never recorded", () => {
  expect(recentReviewFor({ mode: "local", demo: true }, "/tmp/demo", now)).toBeNull()
  expect(recentReviewFor({ mode: "pr", prInfo, demo: true }, "/tmp/demo", now)).toBeNull()
})
