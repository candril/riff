import { describe, expect, test } from "bun:test"
import { readPrLookups } from "./lookups"

const repos = [
  { owner: "acme", repo: "web" },
  { owner: "acme", repo: "gone" },
  { owner: "me", repo: "lane" },
]

describe("readPrLookups", () => {
  test("a repo or PR that is not there is null beside the ones that are", () => {
    const stdout = JSON.stringify({
      data: {
        r0: { pullRequest: { title: "Fix", state: "OPEN", isDraft: true, author: { login: "kim" } } },
        r1: null,
        r2: { pullRequest: null },
      },
      errors: [{ type: "NOT_FOUND", message: "Could not resolve" }],
    })
    expect(readPrLookups(stdout, "gh: Could not resolve", repos)).toEqual(
      new Map([
        ["acme/web", { title: "Fix", state: "OPEN", isDraft: true, author: "kim" }],
        ["acme/gone", null],
        ["me/lane", null],
      ])
    )
  })

  test("a deleted author leaves the PR without one", () => {
    const stdout = JSON.stringify({ data: { r0: { pullRequest: { title: "Fix", state: "MERGED", isDraft: false, author: null } } } })
    expect(readPrLookups(stdout, "", [repos[0]!]).get("acme/web")?.author).toBeNull()
  })

  test("no data at all is a failure, in GitHub's words or gh's", () => {
    expect(() => readPrLookups(JSON.stringify({ errors: [{ message: "rate limited" }] }), "", repos)).toThrow("rate limited")
    expect(() => readPrLookups("", "\nTo get started with GitHub CLI, please run: gh auth login\n", repos)).toThrow("gh auth login")
    expect(() => readPrLookups("", "", repos)).toThrow("GitHub did not answer")
  })
})
