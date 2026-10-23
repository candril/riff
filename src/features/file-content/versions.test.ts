import { describe, expect, test } from "bun:test"
import type { AppState } from "../../state"
import { commitsReview } from "../../testing/commit-scope"
import { createFileVersionsReader, type FileVersionSources } from "./versions"

type Call = [name: string, ...args: unknown[]]

function recordingSources(answers: Partial<Record<keyof FileVersionSources, unknown>> = {}) {
  const calls: Call[] = []
  const source =
    (name: keyof FileVersionSources, fallback: unknown) =>
    async (...args: unknown[]) => {
      calls.push([name, ...args])
      return name in answers ? answers[name] : fallback
    }
  const sources = {
    getPrFileContent: source("getPrFileContent", { ok: true, content: "new" }),
    getPrBaseFileContent: source("getPrBaseFileContent", { ok: true, content: "old" }),
    getFileContentAtRef: source("getFileContentAtRef", { ok: true, content: "at ref" }),
    getFileContent: source("getFileContent", "working tree"),
    getOldFileContent: source("getOldFileContent", "old local"),
  } as unknown as FileVersionSources
  return { sources, calls }
}

function reader(
  state: AppState,
  sources: FileVersionSources,
  over: { head?: () => string | undefined; target?: string; getCommitParentSha?: () => Promise<string> } = {},
) {
  return createFileVersionsReader({
    sources,
    getState: () => state,
    head: over.head ?? (() => "head123"),
    target: over.target,
    getCommitParentSha: over.getCommitParentSha ?? (() => Promise.reject(new Error("unexpected getCommitParentSha"))),
  })
}

describe("createFileVersionsReader in a PR review", () => {
  test("reads the head riff loaded and the PR's base ref when no commit is in scope", async () => {
    const { sources, calls } = recordingSources()

    const result = await reader(commitsReview("pr"), sources)("a.ts")

    expect(calls).toEqual([
      ["getPrFileContent", "owner", "repo", 1259, "a.ts", "head123"],
      ["getPrBaseFileContent", "owner", "repo", 1259, "a.ts", "master", "head123"],
    ])
    expect(result).toEqual({ ok: true, newContent: "new", oldContent: "old" })
  })

  test("treats a file the PR added, with no base version, as read", async () => {
    const { sources } = recordingSources({ getPrBaseFileContent: { ok: false, error: "Not Found" } })

    const result = await reader(commitsReview("pr"), sources)("a.ts")

    expect(result).toEqual({ ok: true, newContent: "new", oldContent: null })
  })

  test("fails with the head's error when the head can't be read", async () => {
    const { sources } = recordingSources({ getPrFileContent: { ok: false, error: "rate limited" } })

    const result = await reader(commitsReview("pr"), sources)("a.ts")

    expect(result).toEqual({ ok: false, error: "rate limited" })
  })

  test("reads a commit in scope at its own sha and at the commit before it", async () => {
    const { sources, calls } = recordingSources()
    const state = { ...commitsReview("pr"), viewingCommit: "ccc3333" }

    const result = await reader(state, sources)("a.ts")

    expect(calls).toEqual([
      ["getFileContentAtRef", "owner", "repo", "a.ts", "ccc3333"],
      ["getFileContentAtRef", "owner", "repo", "a.ts", "bbb2222"],
    ])
    expect(result).toEqual({ ok: true, newContent: "at ref", oldContent: "at ref" })
  })

  test("asks for the parent of the review's first commit when the span starts there", async () => {
    const { sources, calls } = recordingSources()
    const asked: unknown[][] = []
    const state = { ...commitsReview("pr"), viewingCommit: "aaa1111" }

    await reader(state, sources, {
      getCommitParentSha: async (...args: unknown[]) => {
        asked.push(args)
        return "parent0"
      },
    })("a.ts")

    expect(asked).toEqual([["owner", "repo", "aaa1111"]])
    expect(calls).toEqual([
      ["getFileContentAtRef", "owner", "repo", "a.ts", "aaa1111"],
      ["getFileContentAtRef", "owner", "repo", "a.ts", "parent0"],
    ])
  })

  test("reads the head as it is at each call, not as it was at creation", async () => {
    const { sources, calls } = recordingSources()
    let head = "head123"
    const read = reader(commitsReview("pr"), sources, { head: () => head })

    await read("a.ts")
    head = "head456"
    await read("a.ts")

    const headReads = calls.filter(([name]) => name === "getPrFileContent").map((call) => call[5])
    expect(headReads).toEqual(["head123", "head456"])
  })
})

describe("createFileVersionsReader in a local review", () => {
  test("reads both sides against the target when no commit is in scope", async () => {
    const { sources, calls } = recordingSources()

    const result = await reader(commitsReview("local"), sources, { target: "main" })("a.ts")

    expect(calls).toEqual([
      ["getFileContent", "a.ts", "main"],
      ["getOldFileContent", "a.ts", "main"],
    ])
    expect(result).toEqual({ ok: true, newContent: "working tree", oldContent: "old local" })
  })

  test("reads a run in scope between its newest and oldest commit", async () => {
    const { sources, calls } = recordingSources()
    const state = { ...commitsReview("local"), viewingCommit: "ccc3333", viewingCommitScope: ["ccc3333", "bbb2222"] }

    await reader(state, sources, { target: "main" })("a.ts")

    expect(calls).toEqual([
      ["getFileContent", "a.ts", "ccc3333"],
      ["getOldFileContent", "a.ts", "bbb2222"],
    ])
  })

  test("fails when the working tree has no such file", async () => {
    const { sources } = recordingSources({ getFileContent: null })

    const result = await reader(commitsReview("local"), sources)("a.ts")

    expect(result).toEqual({ ok: false, error: "Could not read file from the working tree" })
  })
})
