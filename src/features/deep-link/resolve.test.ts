import { describe, expect, test } from "bun:test"
import type { Comment } from "../../types"
import type { DiffFile } from "../../utils/diff-parser"
import { fileForPathHash, pathHash, reviewCommentForGithubId } from "./resolve"

const file = (filename: string, extra: Partial<DiffFile> = {}): DiffFile => ({
  filename,
  additions: 1,
  deletions: 0,
  status: "modified",
  content: "",
  ...extra,
})

describe("pathHash", () => {
  test("is GitHub's anchor for the path: SHA-256, as hex", () => {
    // As `printf <path> | shasum -a 256` prints it.
    expect(pathHash("README.md")).toBe("b335630551682c19a781afebcf4d07bf978fb1f8ac04c6bf87428ed5106870f5")
    expect(pathHash("src/app.ts")).toBe("841254fe75488c1bd4cd7f68f00b4be0e48dcfbc4a16b45847b68295e0e3b27b")
  })
})

describe("fileForPathHash", () => {
  const files = [file("src/a.ts"), file("src/new.ts", { status: "renamed", oldFilename: "src/old.ts" })]

  test("finds a file by its path", () => {
    expect(fileForPathHash(files, pathHash("src/a.ts"))?.filename).toBe("src/a.ts")
  })

  test("finds a rename by its new path or its old one", () => {
    expect(fileForPathHash(files, pathHash("src/new.ts"))?.filename).toBe("src/new.ts")
    expect(fileForPathHash(files, pathHash("src/old.ts"))?.filename).toBe("src/new.ts")
  })

  test("a file not in the diff is none", () => {
    expect(fileForPathHash(files, pathHash("src/gone.ts"))).toBeNull()
  })
})

describe("reviewCommentForGithubId", () => {
  const comment = (id: string, extra: Partial<Comment>): Comment => ({
    id,
    filename: "src/a.ts",
    line: 1,
    side: "RIGHT",
    body: id,
    createdAt: "2026-01-01T00:00:00Z",
    status: "synced",
    ...extra,
  })
  const comments = [
    comment("root", { githubId: 10, line: 12, side: "LEFT" }),
    comment("reply", { githubId: 11, inReplyTo: "root", line: 0 }),
  ]

  test("a root is itself", () => {
    expect(reviewCommentForGithubId(comments, 10)).toMatchObject({ id: "root", line: 12, side: "LEFT" })
  })

  test("a reply keeps its id and takes its thread's anchor", () => {
    expect(reviewCommentForGithubId(comments, 11)).toMatchObject({ id: "reply", filename: "src/a.ts", line: 12, side: "LEFT" })
  })

  test("an id the PR does not have is none", () => {
    expect(reviewCommentForGithubId(comments, 99)).toBeNull()
  })
})
