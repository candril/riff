import { test, expect, describe } from "bun:test"
import { fileAsDiff, unreadableAsDiff, buildFilesDiff } from "./files"
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
  test("file mode has no anchor to give GitHub on any row", () => {
    const files = parseDiff(fileAsDiff("a.txt", "one\ntwo\n"))
    const asDiff = new DiffLineMapping(files, "single", 0)
    const asFiles = new DiffLineMapping(files, "single", 0, { outsideDiff: true })

    // The same row is commentable read as a diff and refused read as a file.
    const row = [0, 1, 2].find((i) => asDiff.getCommentAnchor(i) !== null)!
    expect(row).toBeDefined()
    expect(asFiles.getCommentAnchor(row)).toBeNull()
    expect(asFiles.isOutsideDiff(row)).toBe(true)
    expect(asFiles.isFileMode()).toBe(true)
    expect(asDiff.isFileMode()).toBe(false)
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
  test("one file opens as one file", async () => {
    const built = await buildFilesDiff({ path: "package.json", directory: false })
    expect(built.filenames).toEqual(["package.json"])
    expect(built.omitted).toBe(0)
    expect(parseDiff(built.diff).length).toBe(1)
  })

  test("a directory opens as every file under it", async () => {
    const built = await buildFilesDiff({ path: "src/providers", directory: true })
    expect(built.filenames).toContain("src/providers/files.ts")
    expect(built.filenames).toContain("src/providers/local.ts")
    expect(parseDiff(built.diff).length).toBe(built.filenames.length)
  })

  test("a directory of files is a diff nothing changed", async () => {
    const built = await buildFilesDiff({ path: "src/providers", directory: true })
    for (const file of parseDiff(built.diff)) {
      expect(file.additions).toBe(0)
      expect(file.deletions).toBe(0)
    }
  })
})
