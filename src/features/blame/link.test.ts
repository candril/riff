import { describe, expect, test } from "bun:test"
import type { LineBlame } from "../../providers/blame/source"
import { blameLinkOf } from "./link"

const line: LineBlame["line"] = {
  kind: "commit",
  commit: { sha: "abc123def456", shortSha: "abc123de", author: "a", date: "2026-01-01T00:00:00Z", subject: "s" },
}
const repo = { owner: "candril", repo: "riff" }

describe("blameLinkOf", () => {
  test("a commit with a PR links the PR", () => {
    expect(blameLinkOf({ line, pr: { number: 7, url: "https://github.com/candril/riff/pull/7" } }, repo)).toBe(
      "https://github.com/candril/riff/pull/7",
    )
  })

  test("a commit with no PR links the commit on the repo", () => {
    expect(blameLinkOf({ line, pr: null }, repo)).toBe("https://github.com/candril/riff/commit/abc123def456")
  })

  test("with no GitHub repo, or no commit, there is nothing to link", () => {
    expect(blameLinkOf({ line, pr: null }, null)).toBeNull()
    expect(blameLinkOf({ line: { kind: "uncommitted" }, pr: null }, repo)).toBeNull()
  })
})
