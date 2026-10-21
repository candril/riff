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

test("the tree is listed once per revision", async () => {
  let listed = 0
  const source = localSource({ localTree: async () => (listed++, ["a.ts", "b.ts"]) })
  expect(await source.tree()).toEqual(["a.ts", "b.ts"])
  expect(await source.tree()).toEqual(["a.ts", "b.ts"])
  expect(listed).toBe(1)
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
