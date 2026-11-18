import { afterEach, beforeEach, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { rmSync } from "fs"
import { loadRecent, recentKey, recordClosed, recordOpened, type RecentReview } from "./recent"

let dir: string
let path: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "riff-recent-"))
  path = join(dir, "nested", "recent.json")
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const pr = (number: number, openedAt = "2026-11-18T10:00:00.000Z"): RecentReview => ({
  kind: "pr", url: `https://github.com/acme/app/pull/${number}`, owner: "acme", repo: "app", number,
  title: `PR ${number}`, directory: "/src/app", openedAt,
})
const local = (target: string | null, directory = "/src/app"): RecentReview => ({
  kind: "local", target, directory, openedAt: "2026-11-18T10:00:00.000Z",
})

test("an opened review goes to the top, replacing its earlier entry", () => {
  recordOpened(pr(1), path)
  recordOpened(pr(2), path)
  recordOpened(pr(1, "2026-11-18T11:00:00.000Z"), path)

  expect(loadRecent(path).map((review) => [recentKey(review), review.openedAt])).toEqual([
    ["https://github.com/acme/app/pull/1", "2026-11-18T11:00:00.000Z"],
    ["https://github.com/acme/app/pull/2", "2026-11-18T10:00:00.000Z"],
  ])
})

test("a local review is one per directory and target", () => {
  recordOpened(local(null), path)
  recordOpened(local("@-"), path)
  recordOpened(local(null, "/src/other"), path)
  recordOpened(local(null), path)

  expect(loadRecent(path)).toHaveLength(3)
})

test("closing marks the entry, and only that one", () => {
  recordOpened(pr(1), path)
  recordOpened(pr(2), path)
  recordClosed(recentKey(pr(1)), new Date("2026-11-18T12:00:00.000Z"), path)
  recordClosed("no such review", new Date(), path)

  const [second, first] = loadRecent(path)
  expect([first!.closedAt, second!.closedAt]).toEqual(["2026-11-18T12:00:00.000Z", undefined])
})

test("keeps the newest 200", () => {
  for (let number = 1; number <= 205; number++) recordOpened(pr(number), path)

  const reviews = loadRecent(path)
  expect([reviews.length, reviews[0]!.kind === "pr" && reviews[0]!.number]).toEqual([200, 205])
})

test("an unreadable file is an empty history, and an unreadable entry is skipped", () => {
  expect(loadRecent(path)).toEqual([])
  writeFileSync(join(dir, "broken.json"), "{")
  expect(loadRecent(join(dir, "broken.json"))).toEqual([])

  const mixed = join(dir, "mixed.json")
  writeFileSync(mixed, JSON.stringify({ reviews: [pr(1), { kind: "pr", url: 3 }, null, local("main")] }))
  expect(loadRecent(mixed).map(recentKey)).toEqual(["https://github.com/acme/app/pull/1", "/src/app\0main"])
})

test("the file is the documented shape", () => {
  recordOpened(local(null), path)
  expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ reviews: [local(null)] })
})
