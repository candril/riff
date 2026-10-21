import { describe, expect, test } from "bun:test"
import { createInitialState } from "../../state"
import { TWO_FILES } from "../../testing/diffs"
import { prInfo } from "../../testing/pr-info"
import { parseDiff } from "../../utils/diff-parser"
import { buildFileTree } from "../../utils/file-tree"
import { createBlameSource, isMissingPath, type BlameRunners } from "./source"

const files = parseDiff(TWO_FILES)
const tree = buildFileTree(files)
const prState = createInitialState(files, tree, "gh:owner/repo#1259", "", null, null, [], "pr", prInfo(""))
const localState = createInitialState(files, tree, "local", "")

const SHA = "204703d97324d5e27aef19adefd7c78febb9e2f1"
const annotate = (lines: number) =>
  Array.from({ length: lines }, (_, i) => `${i + 1}\x1f${SHA}\x1fAda\x1f2026-09-06T17:57:37Z\x1fsubject\n`).join("")

// Every runner fails unless a test gives it, so no test can reach gh, jj or git.
const unreachable = (name: string) => () => {
  throw new Error(`${name} was not stubbed`)
}
const stubbed = (runners: Partial<BlameRunners>): BlameRunners => ({
  vcs: unreachable("vcs"),
  jjAnnotate: unreachable("jjAnnotate"),
  gitBlame: unreachable("gitBlame"),
  gitBase: unreachable("gitBase"),
  prBase: unreachable("prBase"),
  prHead: unreachable("prHead"),
  githubBlame: unreachable("githubBlame"),
  repoRef: async () => null,
  prForCommit: unreachable("prForCommit"),
  ...runners,
})

function jjSource(runners: Partial<BlameRunners>, target?: string) {
  return createBlameSource({
    state: () => localState,
    target,
    headSha: () => null,
    runners: stubbed({ vcs: async () => "jj", ...runners }),
  })
}

test("the base side is blamed in the base revision, the head side in the head revision", async () => {
  const asked: string[] = []
  const source = jjSource({ jjAnnotate: async (rev) => (asked.push(rev), annotate(3)) }, "xyz")
  await source.lineBlame("a.ts", "base", 1)
  await source.lineBlame("a.ts", "head", 1)
  expect(asked).toEqual(["xyz-", "xyz"])
})

test("a file at a fixed revision is blamed once; the working copy every time", async () => {
  const asked: string[] = []
  const source = jjSource({ jjAnnotate: async (rev) => (asked.push(rev), annotate(3)) })
  await source.lineBlame("a.ts", "base", 1)
  await source.lineBlame("a.ts", "base", 2)
  await source.lineBlame("a.ts", "head", 1)
  await source.lineBlame("a.ts", "head", 2)
  expect(asked).toEqual(["trunk()", "@", "@"])
})

test("a failed blame is not remembered, so the next call runs it again", async () => {
  let runs = 0
  const source = jjSource(
    {
      jjAnnotate: async () => {
        if (++runs === 1) throw new Error("jj: lock held")
        return annotate(1)
      },
    },
    "xyz",
  )
  await expect(source.lineBlame("a.ts", "head", 1)).rejects.toThrow("jj: lock held")
  expect((await source.lineBlame("a.ts", "head", 1))?.line).toMatchObject({ kind: "commit" })
  expect(runs).toBe(2)
})

test("a line past the end, or a file the side does not have, is no blame", async () => {
  const source = jjSource({ jjAnnotate: async (_rev, path) => (path === "gone.ts" ? null : annotate(2)) }, "xyz")
  expect(await source.lineBlame("a.ts", "head", 3)).toBeNull()
  expect(await source.lineBlame("gone.ts", "head", 1)).toBeNull()
})

test("an uncommitted line in a git working tree comes through as uncommitted", async () => {
  const asked: (string | null)[] = []
  const source = createBlameSource({
    state: () => localState,
    target: undefined,
    headSha: () => null,
    runners: stubbed({
      vcs: async () => "git",
      gitBlame: async (rev) => (asked.push(rev), `${"0".repeat(40)} 1 1 1\nauthor Not Committed Yet\n\tnew line\n`),
    }),
  })
  expect(await source.lineBlame("a.ts", "head", 1)).toEqual({ line: { kind: "uncommitted" }, pr: null })
  expect(asked).toEqual([null])
})

test("a local review on a GitHub remote names the commit's PR; one without a remote names none", async () => {
  const pr = { number: 9, url: "https://github.com/o/r/pull/9" }
  const onGithub = jjSource({
    jjAnnotate: async () => annotate(1),
    repoRef: async () => ({ owner: "o", repo: "r" }),
    prForCommit: async (owner, repo, sha) => (owner === "o" && repo === "r" && sha === SHA ? pr : null),
  })
  expect((await onGithub.lineBlame("a.ts", "head", 1))?.pr).toEqual(pr)
  const offGithub = jjSource({ jjAnnotate: async () => annotate(1) })
  expect((await offGithub.lineBlame("a.ts", "head", 1))?.pr).toBeNull()
})

test("a PR is blamed on GitHub at its head, and its base at the merge base, with the PR GitHub names", async () => {
  const asked: unknown[][] = []
  const range = {
    startingLine: 1,
    endingLine: 1,
    commit: {
      oid: SHA,
      committedDate: "2026-10-02T10:00:00Z",
      messageHeadline: "subject",
      author: { name: "Ada", date: null, user: null },
      associatedPullRequests: { nodes: [{ number: 5, url: "u" }] },
    },
  }
  const source = createBlameSource({
    state: () => prState,
    target: undefined,
    headSha: () => "abc123",
    runners: stubbed({
      prBase: async (...args) => (asked.push(["prBase", ...args]), "merge-base"),
      githubBlame: async (...args) => (asked.push(["blame", ...args]), { data: { repository: { object: { blame: { ranges: [range] } } } } }),
    }),
  })
  expect((await source.lineBlame("a.ts", "head", 1))?.pr).toEqual({ number: 5, url: "u" })
  await source.lineBlame("a.ts", "base", 1)
  expect(asked).toEqual([
    ["blame", "owner", "repo", "abc123", "a.ts"],
    ["prBase", "owner", "repo", 1259, "master", "abc123"],
    ["blame", "owner", "repo", "merge-base", "a.ts"],
  ])
})

test("a whole file's blame is the same read lineBlame shares, by line number", async () => {
  let runs = 0
  const source = jjSource({ jjAnnotate: async () => (runs++, annotate(3)) }, "xyz")
  const loaded = await source.fileBlame("a.ts", "head")
  expect(loaded?.blame.length).toBe(4)
  expect(loaded?.blame[2]).toMatchObject({ kind: "commit", commit: { sha: SHA, author: "Ada" } })
  expect(loaded?.prs).toBeNull()
  expect((await source.lineBlame("a.ts", "head", 2))?.line).toBe(loaded!.blame[2]!)
  expect(await source.fileBlame("a.ts", "head")).toBe(loaded!)
  expect(runs).toBe(1)
})

test("a whole file the side does not have is no blame", async () => {
  const source = jjSource({ jjAnnotate: async () => null }, "xyz")
  expect(await source.fileBlame("gone.ts", "base")).toBeNull()
})

test("a PR's whole-file blame carries the PRs GitHub names", async () => {
  const range = {
    startingLine: 1,
    endingLine: 2,
    commit: {
      oid: SHA,
      committedDate: "2026-10-02T10:00:00Z",
      messageHeadline: "subject",
      author: { name: "Ada", date: null, user: null },
      associatedPullRequests: { nodes: [{ number: 5, url: "u" }] },
    },
  }
  const source = createBlameSource({
    state: () => prState,
    target: undefined,
    headSha: () => "abc123",
    runners: stubbed({ githubBlame: async () => ({ data: { repository: { object: { blame: { ranges: [range] } } } } }) }),
  })
  const loaded = await source.fileBlame("a.ts", "head")
  expect(loaded?.blame[2]).toMatchObject({ kind: "commit" })
  expect(loaded?.prs?.get(SHA)).toEqual({ number: 5, url: "u" })
})

test("a PR whose head is not loaded yet asks GitHub for it, and its blame is kept under that commit", async () => {
  const heads: unknown[][] = []
  const blamed: string[] = []
  const source = createBlameSource({
    state: () => prState,
    target: undefined,
    headSha: () => null,
    runners: stubbed({
      prHead: async (...args) => (heads.push(args), "def456"),
      githubBlame: async (_owner, _repo, commit) => (blamed.push(commit), { data: { repository: { object: { blame: { ranges: [] } } } } }),
    }),
  })
  await source.lineBlame("a.ts", "head", 1)
  expect(heads).toEqual([["owner", "repo", 1259]])
  expect(blamed).toEqual(["def456"])
  await source.lineBlame("a.ts", "head", 2)
  expect(blamed).toEqual(["def456"])
})

describe("isMissingPath", () => {
  test("jj's and git's words for a path the revision lacks", () => {
    expect(isMissingPath("Error: No such path: nope.ts")).toBe(true)
    expect(isMissingPath("fatal: no such path nope.ts in HEAD")).toBe(true)
    expect(isMissingPath("fatal: cannot stat path 'x': No such file or directory")).toBe(true)
  })

  test("an unrelated missing file is a failure, not a missing path", () => {
    expect(isMissingPath("ENOENT: No such file or directory, posix_spawn 'jj'")).toBe(false)
  })
})
