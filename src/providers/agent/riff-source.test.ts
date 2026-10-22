import { expect, test } from "bun:test"
import { createInitialState } from "../../state"
import { TWO_FILES } from "../../testing/diffs"
import { prInfo } from "../../testing/pr-info"
import { parseDiff } from "../../utils/diff-parser"
import { buildFileTree } from "../../utils/file-tree"
import { TREE_CUT_OFF } from "./review-source"
import { createRiffSource, type RiffSourceReaders } from "./riff-source"

const files = parseDiff(TWO_FILES)
const tree = buildFileTree(files)
const prState = createInitialState(files, tree, "gh:owner/repo#1259", "", null, null, [], "pr", prInfo(""))
const localState = createInitialState(files, tree, "local", "")

// Every reader fails unless a test gives it, so no test can reach gh, jj or git.
const unreachable = (name: string) => () => {
  throw new Error(`${name} was not stubbed`)
}
const stubbed = (readers: Partial<RiffSourceReaders>): RiffSourceReaders => ({
  prHead: unreachable("prHead"),
  prBase: unreachable("prBase"),
  localHead: unreachable("localHead"),
  localBase: unreachable("localBase"),
  prTree: unreachable("prTree"),
  localTree: unreachable("localTree"),
  ...readers,
})

function prSource(readers: Partial<RiffSourceReaders>) {
  return createRiffSource({
    state: () => prState,
    target: undefined,
    headSha: () => "abc123",
    readers: stubbed(readers),
  })
}

function localSource(readers: Partial<RiffSourceReaders>, target?: string) {
  return createRiffSource({ state: () => localState, target, headSha: () => null, readers: stubbed(readers) })
}

test("a PR's head is read at the loaded head, its base at the base ref against that head", async () => {
  const calls: unknown[][] = []
  const source = prSource({
    prHead: async (...args) => (calls.push(["head", ...args]), { ok: true, content: "new" }),
    prBase: async (...args) => (calls.push(["base", ...args]), { ok: true, content: "old" }),
  })
  expect(await source.fileText("a.ts", "head")).toEqual({ kind: "text", text: "new" })
  expect(await source.fileText("a.ts", "base")).toEqual({ kind: "text", text: "old" })
  expect(calls).toEqual([
    ["head", "owner", "repo", 1259, "a.ts", "abc123"],
    ["base", "owner", "repo", 1259, "a.ts", "master", "abc123"],
  ])
})

test("a file GitHub does not have is missing; any other failure is thrown for the tool to report", async () => {
  const source = prSource({
    prHead: async () => ({ ok: false, error: "Not on GitHub at this revision" }),
    prBase: async () => ({ ok: false, error: "GitHub API rate limit exceeded" }),
  })
  expect(await source.fileText("new.ts", "head")).toEqual({ kind: "missing" })
  await expect(source.fileText("a.ts", "base")).rejects.toThrow("GitHub API rate limit exceeded")
})

test("text with a NUL byte near its start is binary", async () => {
  const source = localSource({ localHead: async () => "PNG\0\x01", localBase: async () => "plain" })
  expect(await source.fileText("logo.png", "head")).toEqual({ kind: "binary" })
  expect(await source.fileText("logo.png", "base")).toEqual({ kind: "text", text: "plain" })
})

test("a local file the VCS cannot read is missing, and the target reaches the readers", async () => {
  const targets: (string | undefined)[] = []
  const source = localSource(
    {
      localHead: async (_path, target) => (targets.push(target), null),
      localBase: async (_path, target) => (targets.push(target), "old"),
    },
    "branch:main",
  )
  expect(await source.fileText("gone.ts", "head")).toEqual({ kind: "missing" })
  expect(await source.fileText("a.ts", "base")).toEqual({ kind: "text", text: "old" })
  expect(targets).toEqual(["branch:main", "branch:main"])
})

test("a local tree is listed on every read, so a file added since shows up", async () => {
  const paths = ["a.ts", "b.ts"]
  let listed = 0
  const source = localSource({ localTree: async () => (listed++, [...paths]) })
  expect(await source.tree()).toEqual(["a.ts", "b.ts"])
  paths.push("c.ts")
  expect(await source.tree()).toEqual(["a.ts", "b.ts", "c.ts"])
  expect(listed).toBe(2)
})

test("a PR's tree is listed once per head", async () => {
  let head = "abc123"
  const shas: string[] = []
  const source = createRiffSource({
    state: () => prState,
    target: undefined,
    headSha: () => head,
    readers: stubbed({
      prTree: async (_owner, _repo, sha) => (shas.push(sha), { paths: [sha], truncated: false }),
    }),
  })
  expect(await source.tree()).toEqual(["abc123"])
  expect(await source.tree()).toEqual(["abc123"])
  head = "def456"
  expect(await source.tree()).toEqual(["def456"])
  expect(shas).toEqual(["abc123", "def456"])
})

test("a failed PR listing is tried again on the next read", async () => {
  let calls = 0
  const source = prSource({
    prTree: async () => {
      if (calls++ === 0) throw new Error("GitHub is down")
      return { paths: ["a.ts"], truncated: false }
    },
  })
  await expect(source.tree()).rejects.toThrow("GitHub is down")
  expect(await source.tree()).toEqual(["a.ts"])
})

test("a PR's tree is listed at the head, and says so when GitHub cut it off", async () => {
  const shas: string[] = []
  const source = prSource({
    prTree: async (_owner, _repo, sha) => (shas.push(sha), { paths: ["a.ts"], truncated: true }),
  })
  expect(await source.tree()).toEqual(["a.ts", TREE_CUT_OFF])
  expect(shas).toEqual(["abc123"])
})

test("outside a repository the tree is the changed files", async () => {
  const source = localSource({ localTree: async () => null })
  expect(await source.tree()).toEqual(files.map((f) => f.filename))
})

test("files, hidden paths and comments are the state's", () => {
  const source = localSource({})
  expect(source.files()).toBe(localState.files)
  expect(source.hiddenPaths()).toBe(localState.ignoredFiles)
  expect(source.comments()).toBe(localState.comments)
})

test("the PR's conversation holds its comments and the bodies of submitted reviews, oldest first", () => {
  const pr = prInfo("", {
    conversationComments: [
      { id: 1, body: "Late note.", author: "dana", createdAt: "2026-10-03T00:00:00Z", updatedAt: "", url: "", isBot: false },
      {
        id: 2,
        body: "First!",
        author: "erin",
        createdAt: "2026-10-01T00:00:00Z",
        updatedAt: "",
        url: "",
        isBot: false,
        reactions: [{ content: "heart", count: 1, viewerHasReacted: false }],
      },
    ],
    reviews: [
      { id: "r1", author: "bob", state: "CHANGES_REQUESTED", body: "Rename it.", submittedAt: "2026-10-02T00:00:00Z" },
      { id: "r2", author: "bob", state: "APPROVED", body: "  \n", submittedAt: "2026-10-04T00:00:00Z" },
      { id: "r3", author: "me", state: "PENDING", body: "Draft.", submittedAt: "2026-10-04T00:00:00Z" },
      { id: "r4", author: "carol", state: "COMMENTED", body: "Unsent?" },
    ],
  })
  const state = createInitialState(files, tree, "gh:owner/repo#1259", "", null, null, [], "pr", pr)
  const source = createRiffSource({ state: () => state, target: undefined, headSha: () => null, readers: stubbed({}) })
  expect(source.conversation()).toEqual([
    {
      kind: "comment",
      author: "erin",
      at: "2026-10-01T00:00:00Z",
      body: "First!",
      reactions: [{ content: "heart", count: 1, viewerHasReacted: false }],
    },
    {
      kind: "review",
      author: "bob",
      at: "2026-10-02T00:00:00Z",
      body: "Rename it.",
      state: "CHANGES_REQUESTED",
      reactions: [],
    },
    { kind: "comment", author: "dana", at: "2026-10-03T00:00:00Z", body: "Late note.", reactions: [] },
  ])
})

test("a PR whose info has not loaded yet says its conversation is loading, not empty", () => {
  const state = { ...prState, prInfo: null }
  const source = createRiffSource({ state: () => state, target: undefined, headSha: () => null, readers: stubbed({}) })
  expect(source.conversation()).toBe("loading")
})

test("a local review has no conversation", () => {
  expect(localSource({}).conversation()).toBeNull()
})
