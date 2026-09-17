import { test, expect, describe } from "bun:test"
import { prFilesAsDiff, type PrFileEntry } from "./github"
import { parseDiff } from "../utils/diff-parser"

/** What `parseDiff` makes of one entry, which is the whole point of it. */
function parsedOne(file: PrFileEntry) {
  const files = parseDiff(prFilesAsDiff([file]))
  expect(files.length).toBe(1)
  return files[0]!
}

describe("a pull request's files as a patch", () => {
  test("a modified file keeps GitHub's own hunk", () => {
    const parsed = parsedOne({
      filename: "CODEOWNERS",
      status: "modified",
      additions: 1,
      deletions: 1,
      changes: 2,
      patch: "@@ -1,2 +1,2 @@\n-/libraries/old/**/* @team\n+/libraries/new/**/* @team\n context",
    })

    expect(parsed.status).toBe("modified")
    expect(parsed.filename).toBe("CODEOWNERS")
    expect(parsed.additions).toBe(1)
    expect(parsed.deletions).toBe(1)
    expect(parsed.content).toContain("--- a/CODEOWNERS")
    expect(parsed.content).toContain("+++ b/CODEOWNERS")
    expect(parsed.content).toContain("+/libraries/new/**/* @team")
  })

  test("a rename that moved no lines is its headers and nothing else", () => {
    const parsed = parsedOne({
      filename: "libraries/new/logo.svg",
      previous_filename: "libraries/old/logo.svg",
      status: "renamed",
      additions: 0,
      deletions: 0,
      changes: 0,
    })

    expect(parsed.status).toBe("renamed")
    expect(parsed.filename).toBe("libraries/new/logo.svg")
    expect(parsed.oldFilename).toBe("libraries/old/logo.svg")
    expect(parsed.additions).toBe(0)
    expect(parsed.deletions).toBe(0)
    expect(parsed.content).toContain("rename from libraries/old/logo.svg")
    expect(parsed.content).not.toContain("@@")
  })

  test("a rename that also changed lines carries both", () => {
    const parsed = parsedOne({
      filename: "libraries/new/index.ts",
      previous_filename: "libraries/old/index.ts",
      status: "renamed",
      additions: 1,
      deletions: 1,
      changes: 2,
      patch: "@@ -1 +1 @@\n-export const name = 'old'\n+export const name = 'new'",
    })

    expect(parsed.status).toBe("renamed")
    expect(parsed.oldFilename).toBe("libraries/old/index.ts")
    expect(parsed.additions).toBe(1)
    expect(parsed.content).toContain("--- a/libraries/old/index.ts")
    expect(parsed.content).toContain("+++ b/libraries/new/index.ts")
  })

  test("an added file comes from nothing", () => {
    const parsed = parsedOne({
      filename: "new.ts",
      status: "added",
      additions: 1,
      deletions: 0,
      changes: 1,
      patch: "@@ -0,0 +1 @@\n+export const fresh = true",
    })

    expect(parsed.status).toBe("added")
    expect(parsed.content).toContain("new file mode")
    expect(parsed.content).toContain("--- /dev/null")
  })

  test("a removed file goes to nothing", () => {
    const parsed = parsedOne({
      filename: "gone.ts",
      status: "removed",
      additions: 0,
      deletions: 1,
      changes: 1,
      patch: "@@ -1 +0,0 @@\n-export const gone = true",
    })

    expect(parsed.status).toBe("deleted")
    expect(parsed.content).toContain("deleted file mode")
    expect(parsed.content).toContain("+++ /dev/null")
  })

  test("changed lines GitHub did not send say so, and are not a hunk of their own", () => {
    const parsed = parsedOne({
      filename: "assets/logo.png",
      status: "modified",
      additions: 0,
      deletions: 0,
      changes: 12,
    })

    // A context row, so nothing reads as added or deleted and no comment
    // can anchor to a line riff invented.
    expect(parsed.additions).toBe(0)
    expect(parsed.deletions).toBe(0)
    expect(parsed.content).toContain("12 changed lines GitHub did not send")
  })

  test("the entries are one patch, in the order they arrived", () => {
    const diff = prFilesAsDiff([
      { filename: "a.ts", status: "modified", additions: 1, deletions: 0, changes: 1, patch: "@@ -1 +1,2 @@\n one\n+two" },
      { filename: "b.ts", status: "added", additions: 1, deletions: 0, changes: 1, patch: "@@ -0,0 +1 @@\n+only" },
    ])

    expect(parseDiff(diff).map((file) => file.filename)).toEqual(["a.ts", "b.ts"])
  })
})
