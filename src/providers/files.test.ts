import { test, expect, describe } from "bun:test"
import { fileAsDiff, unreadableAsDiff, buildFilesDiff, openFileAsDiff } from "./files"
import { parseDiff } from "../utils/diff-parser"
import { DiffLineMapping } from "../vim-diff/line-mapping"

describe("fileAsDiff", () => {
  test("a file is a diff with no changes", () => {
    const [file] = parseDiff(fileAsDiff("src/a.ts", "one\ntwo\nthree\n"))
    expect(file?.filename).toBe("src/a.ts")
    expect(file?.additions).toBe(0)
    expect(file?.deletions).toBe(0)
  })

  test("every line is context, numbered the same on both sides", () => {
    const files = parseDiff(fileAsDiff("a.txt", "one\ntwo\n"))
    const mapping = new DiffLineMapping(files, "single", 0)
    const rows = [0, 1, 2].map((i) => mapping.getLine(i)).filter((l) => l?.type === "context")
    expect(rows.map((l) => l!.content)).toEqual(["one", "two"])
    expect(rows.map((l) => l!.oldLineNum)).toEqual([1, 2])
    expect(rows.map((l) => l!.newLineNum)).toEqual([1, 2])
  })

  test("a file ending without a newline says so", () => {
    expect(fileAsDiff("a.txt", "one\ntwo")).toContain("\\ No newline at end of file")
    expect(fileAsDiff("a.txt", "one\ntwo\n")).not.toContain("\\ No newline")
  })

  test("an empty file parses to a file with no lines", () => {
    const [file] = parseDiff(fileAsDiff("empty.txt", ""))
    expect(file?.filename).toBe("empty.txt")
  })
})

describe("outsideDiff", () => {
  test("every row of a file anchors, and none of them is publishable", () => {
    const files = parseDiff(fileAsDiff("a.txt", "one\ntwo\n"))
    const asDiff = new DiffLineMapping(files, "single", 0)
    const asFiles = new DiffLineMapping(files, "single", 0, { outsideDiff: true })

    // riff has the line either way; only GitHub's answer differs (spec 085).
    const row = [0, 1, 2].find((i) => asDiff.getCommentAnchor(i) !== null)!
    expect(row).toBeDefined()
    expect(asDiff.getCommentAnchor(row)?.note).toBe(false)
    expect(asFiles.getCommentAnchor(row)?.note).toBe(true)
    expect(asFiles.isFileMode()).toBe(true)
    expect(asDiff.isFileMode()).toBe(false)
  })
})

describe("the rest of the file", () => {
  test("a diff offers what its hunks left out; a file has left nothing out", () => {
    // One hunk ending before the file does: the diff asks to see the rest.
    const partial = [
      "diff --git a/a.txt b/a.txt",
      "--- a/a.txt",
      "+++ b/a.txt",
      "@@ -1,1 +1,1 @@",
      " one",
      "",
    ].join("\n")
    const files = parseDiff(partial)

    const asDiff = new DiffLineMapping(files, "single", 0)
    const asFiles = new DiffLineMapping(files, "single", 0, { outsideDiff: true })

    const dividers = (mapping: DiffLineMapping) =>
      Array.from({ length: mapping.lineCount }, (_, i) => mapping.getLine(i))
        .filter((line) => line?.type === "divider").length

    expect(dividers(asDiff)).toBe(1)
    expect(dividers(asFiles)).toBe(0)
  })
})

describe("unreadableAsDiff", () => {
  test("a file riff will not draw still parses as one", () => {
    const [file] = parseDiff(unreadableAsDiff("logo.png", "logo.png is not text"))
    expect(file?.filename).toBe("logo.png")
    expect(file?.content).toContain("is not text")
  })
})

describe("buildFilesDiff", () => {
  test("a file names where to open; the repository is what is listed", async () => {
    const built = await buildFilesDiff({ path: "package.json", directory: false })
    expect(built.selected).toBe("package.json")
    expect(built.filenames).toContain("package.json")
    expect(built.filenames).toContain("src/app.ts")
  })

  test("a directory lists what is under it and opens nothing in particular", async () => {
    const built = await buildFilesDiff({ path: "src/providers", directory: true })
    expect(built.selected).toBeNull()
    expect(built.filenames).toContain("src/providers/files.ts")
    expect(built.filenames.every((name) => name.startsWith("src/providers/"))).toBe(true)
  })

  test("nothing is read until a file is opened", async () => {
    const built = await buildFilesDiff({ path: "src/providers", directory: true })
    const files = parseDiff(built.diff)
    expect(files.length).toBe(built.filenames.length)
    // A stub has a name and no hunk, so the mapping draws no rows for it.
    expect(new DiffLineMapping(files, "single", 0).lineCount).toBe(0)
    expect(built.diff).not.toContain("@@")
  })

  test("a file that is opened is read", async () => {
    const opened = await openFileAsDiff("package.json")
    expect(opened).toContain("@@")
    const [file] = parseDiff(opened)
    expect(file?.additions).toBe(0)
    expect(file?.deletions).toBe(0)
  })

  test("a file riff will not draw opens as the reason it will not", async () => {
    const opened = await openFileAsDiff("site/src/assets/logo.png")
    expect(opened).toContain("is not text")
  })
})
