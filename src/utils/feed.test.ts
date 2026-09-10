import { test, expect, describe } from "bun:test"
import { buildFeed, visibleFeed, type TimelineEntry } from "./feed"
import type { Comment } from "../types"
import type { PrCheck, PrCommit } from "../providers/github"

const timeline: TimelineEntry[] = [
  {
    event: "committed",
    sha: "a3f2c19aaa",
    created_at: "2026-01-10T10:00:00Z",
    message: "fix: handle empty hunks\n\nlonger body",
  },
  {
    event: "reviewed",
    state: "APPROVED",
    submitted_at: "2026-01-10T12:00:00Z",
    user: { login: "carol" },
    html_url: "https://github.com/o/r/pull/1#pullrequestreview-1",
  },
  {
    event: "head_ref_force_pushed",
    created_at: "2026-01-10T09:00:00Z",
    actor: { login: "alice" },
  },
  { event: "labeled", created_at: "2026-01-10T08:00:00Z" },
]

const comments: Comment[] = [
  {
    id: "c1",
    filename: "parser.ts",
    line: 88,
    side: "RIGHT",
    body: "this drops the last line",
    createdAt: "2026-01-10T11:00:00Z",
    status: "synced",
    author: "alice",
    isThreadResolved: true,
  },
  {
    id: "c2",
    filename: "parser.ts",
    line: 88,
    side: "RIGHT",
    body: "fixed in a3f2c19",
    createdAt: "2026-01-10T11:30:00Z",
    status: "synced",
    author: "bob",
    inReplyTo: "c1",
  },
]

const checks: PrCheck[] = [
  {
    id: 7,
    name: "CI / test",
    status: "completed",
    conclusion: "success",
    detailsUrl: "https://ci.example.com/7",
    startedAt: "2026-01-10T10:30:00Z",
    completedAt: "2026-01-10T10:40:00Z",
  },
]

const commits: PrCommit[] = [
  { sha: "a3f2c19", message: "fix: handle empty hunks", author: "alice", date: "2026-01-10T10:00:00Z" },
]

function feed() {
  return buildFeed({ timeline, comments, checks, commits, prInfo: null })
}

describe("what happened, newest first", () => {
  test("one stream out of the timeline, the comments and the checks", () => {
    expect(feed().map((event) => `${event.type} ${event.title}`)).toEqual([
      "review approved",
      "comment fixed in a3f2c19",
      "comment this drops the last line",
      "check CI / test",
      "commit fix: handle empty hunks",
      "push force-pushed",
    ])
  })

  test("a commit row carries what riff already knows about the commit", () => {
    const commit = feed().find((event) => event.type === "commit")

    expect(commit).toMatchObject({ actor: "alice", lead: "a3f2c19" })
    expect(commit?.target).toEqual({ kind: "commit", sha: "a3f2c19" })
  })

  test("a check says what it turned into", () => {
    expect(feed().find((event) => event.type === "check")?.trailing).toBe("✓ passing")
  })

  test("timeline events riff has nothing to say about are left out", () => {
    expect(feed().some((event) => event.title.includes("label"))).toBe(false)
  })

  test("a resolved thread is a mark on its comments, every reply included", () => {
    const marked = feed().filter((event) => event.resolved).map((event) => event.title)

    // Not an event of its own: the timeline never says when it was resolved.
    expect(marked).toEqual(["fixed in a3f2c19", "this drops the last line"])
    expect(feed().some((event) => event.title === "resolved")).toBe(false)
  })

  test("a force-push is in there — no other source reports one", () => {
    expect(feed().find((event) => event.type === "push")).toMatchObject({
      actor: "alice",
      title: "force-pushed",
    })
  })
})

describe("narrowing the feed", () => {
  const events = feed()

  test("no types selected means all of them", () => {
    expect(visibleFeed(events, { types: new Set(), filter: "" }).length).toBe(events.length)
  })

  test("a type toggled on leaves only that type", () => {
    const only = visibleFeed(events, { types: new Set(["commit"]), filter: "" })

    expect(only.map((event) => event.type)).toEqual(["commit"])
  })

  test("the text filter reads the row, not the ids", () => {
    expect(visibleFeed(events, { types: new Set(), filter: "empty hunks" }).length).toBe(1)
    expect(visibleFeed(events, { types: new Set(), filter: "carol" }).length).toBe(1)
  })

  test("`resolved` is the slice of comments whose thread was answered", () => {
    const settled = visibleFeed(events, { types: new Set(["resolved"]), filter: "" })

    expect(settled.every((event) => event.type === "comment" && event.resolved)).toBe(true)
    expect(settled.length).toBe(2)
  })

  test("unseen narrows to the comments that arrived since the last visit", () => {
    const unseen = visibleFeed(events, {
      types: new Set(),
      filter: "",
      unseenIds: new Set(["c1"]),
    })

    expect(unseen.map((event) => event.title)).toEqual(["this drops the last line"])
  })
})
