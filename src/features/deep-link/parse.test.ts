import { describe, expect, test } from "bun:test"
import { parseFragment, parsePrLink, printableFragment, samePr } from "./parse"

const HASH = "a".repeat(56) + "0123abcd"
const PR = "https://github.com/owner/repo/pull/5"

describe("parseFragment", () => {
  test("a review comment, by either anchor GitHub writes for one", () => {
    expect(parseFragment("discussion_r123")).toEqual({ kind: "target", target: { kind: "review-comment", githubId: 123 } })
    expect(parseFragment("r123")).toEqual({ kind: "target", target: { kind: "review-comment", githubId: 123 } })
  })

  test("a conversation comment and a review", () => {
    expect(parseFragment("issuecomment-77")).toEqual({ kind: "target", target: { kind: "issue-comment", githubId: 77 } })
    expect(parseFragment("pullrequestreview-9")).toEqual({ kind: "target", target: { kind: "review", reviewId: 9 } })
  })

  test("a file, alone or at a line of either side", () => {
    expect(parseFragment(`diff-${HASH}`)).toEqual({ kind: "target", target: { kind: "file", pathHash: HASH } })
    expect(parseFragment(`diff-${HASH}R42`)).toEqual({
      kind: "target",
      target: { kind: "file", pathHash: HASH, line: { side: "RIGHT", number: 42 } },
    })
    expect(parseFragment(`diff-${HASH}L3`)).toEqual({
      kind: "target",
      target: { kind: "file", pathHash: HASH, line: { side: "LEFT", number: 3 } },
    })
  })

  test("a range lands on its first line", () => {
    expect(parseFragment(`diff-${HASH}R10-R20`)).toEqual({
      kind: "target",
      target: { kind: "file", pathHash: HASH, line: { side: "RIGHT", number: 10 } },
    })
    expect(parseFragment(`diff-${HASH}L4-R9`)).toEqual({
      kind: "target",
      target: { kind: "file", pathHash: HASH, line: { side: "LEFT", number: 4 } },
    })
  })

  test("no fragment is no target", () => {
    expect(parseFragment("")).toBeNull()
  })

  test.each([
    "discussion_r",
    "discussion_r12x",
    "r-1",
    "r0",
    "issuecomment-",
    "issuecomment-1-2",
    "pullrequestreview-abc",
    "diff-" + HASH.slice(1),
    "diff-" + HASH.toUpperCase(),
    `diff-${HASH}R`,
    `diff-${HASH}R0`,
    `diff-${HASH}X3`,
    `diff-${HASH}R3-`,
    `diff-${HASH}R3-R4-R5`,
    "commits-pushed-abc",
    "r99999999999999999999",
    "<script>",
    "r1\u001b[2J",
  ])("%p is read but not followed", (fragment) => {
    expect(parseFragment(fragment)).toEqual({ kind: "unknown", fragment })
  })
})

describe("parsePrLink", () => {
  test("a canonical link", () => {
    expect(parsePrLink(`${PR}#discussion_r1`)).toEqual({
      owner: "owner",
      repo: "repo",
      number: 5,
      fragment: { kind: "target", target: { kind: "review-comment", githubId: 1 } },
    })
    expect(parsePrLink(PR)).toEqual({ owner: "owner", repo: "repo", number: 5, fragment: null })
  })

  test("a raw link from the files and changes tabs", () => {
    expect(parsePrLink(`${PR}/files#r123`)?.fragment).toEqual({ kind: "target", target: { kind: "review-comment", githubId: 123 } })
    expect(parsePrLink(`${PR}/changes#diff-${HASH}R7`)?.fragment).toEqual({
      kind: "target",
      target: { kind: "file", pathHash: HASH, line: { side: "RIGHT", number: 7 } },
    })
    expect(parsePrLink(`${PR}/files?w=1#issuecomment-4`)?.fragment).toEqual({
      kind: "target",
      target: { kind: "issue-comment", githubId: 4 },
    })
    expect(parsePrLink(`${PR}/commits/abc123`)).toEqual({ owner: "owner", repo: "repo", number: 5, fragment: null })
  })

  test("an unknown fragment is kept, for the toast to name", () => {
    expect(parsePrLink(`${PR}#top`)?.fragment).toEqual({ kind: "unknown", fragment: "top" })
  })

  test.each([
    "https://github.com/owner/repo/issues/5#issuecomment-1",
    "https://github.com/owner/repo/pull/abc",
    "https://github.com/owner/repo/pull/0",
    "https://evil.example/github.com/owner/repo/pull/5",
    "https://github.com.evil.example/owner/repo/pull/5",
    "https://github.com/own er/repo/pull/5",
    "file:///github.com/owner/repo/pull/5",
    "gh:owner/repo#5",
    "",
  ])("%p is no PR link", (url) => {
    expect(parsePrLink(url)).toBeNull()
  })
})

describe("samePr", () => {
  test("names are compared the way GitHub reads them, without regard to case", () => {
    expect(samePr({ owner: "Owner", repo: "Repo", number: 5 }, "gh:owner/repo#5")).toBe(true)
    expect(samePr({ owner: "owner", repo: "repo", number: 6 }, "gh:owner/repo#5")).toBe(false)
    expect(samePr({ owner: "owner", repo: "other", number: 5 }, "gh:owner/repo#5")).toBe(false)
  })
})

describe("printableFragment", () => {
  test("control characters never reach the terminal, and a long fragment is cut", () => {
    expect(printableFragment("a\u001b[2Jb")).toBe("a?[2Jb")
    expect(printableFragment("x".repeat(50), 10)).toBe("xxxxxxxxx…")
  })
})
