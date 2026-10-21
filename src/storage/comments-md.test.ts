import { test, expect, describe } from "bun:test"
import type { Comment } from "../types"
import { parseComment, parseFrontmatter, toMarkdown } from "./comments-md"

function roundTrip(comment: Comment): Comment {
  const { meta, body } = parseFrontmatter(toMarkdown(comment))
  return parseComment(meta, body)
}

describe("a comment file reads back as the comment that wrote it", () => {
  test("a local comment", () => {
    const comment: Comment = {
      id: "aaaaaaaa-0000-0000-0000-000000000000",
      filename: "src/app.ts",
      line: 12,
      side: "RIGHT",
      body: "rename this",
      createdAt: "2026-09-11T09:00:00Z",
      status: "local",
      author: "@you",
    }

    expect(roundTrip(comment)).toEqual(comment)
  })

  test("a GitHub reply with a multi-line body, a range and its diff context", () => {
    const comment: Comment = {
      id: "gh-12345678",
      filename: "src/storage/resolve.ts",
      line: 40,
      startLine: 36,
      side: "LEFT",
      body: "first line\n\nsecond paragraph\n- a list item",
      createdAt: "2026-09-12T10:30:00Z",
      status: "synced",
      commit: "abc123",
      diffHunk: "@@ -36,5 +36,5 @@\n-old\n+new",
      githubId: 12345678,
      githubUrl: "https://github.com/owner/repo/pull/1#discussion_r12345678",
      githubThreadId: "PRRT_kwDO",
      isThreadResolved: false,
      outdated: true,
      author: "octocat",
      inReplyTo: "gh-12345600",
    }

    expect(roundTrip(comment)).toEqual(comment)
  })
})
