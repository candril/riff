import { describe, expect, test } from "bun:test"
import { createInitialState } from "../../state"
import type { DiffFile } from "../../utils/diff-parser"
import { filterAtCandidates } from "../../components/at-picker"
import { fullPr } from "../../testing/pr-info-panel"
import { chatAtCandidates } from "./at-candidates"

const file = (filename: string, status: DiffFile["status"] = "modified", additions = 3, deletions = 1): DiffFile => ({
  filename,
  additions,
  deletions,
  status,
  content: "",
})

const FILES = [file("input/deeply/nested/other.ts"), file("src/a/input.ts", "added", 12, 0), file("old.ts", "deleted", 0, 7)]
const local = () => createInitialState(FILES, [], "local", "")
const pr = () => createInitialState(FILES, [], "gh:o/r#1", "#1", null, null, [], "pr", fullPr())
const texts = (candidates: { text: string }[]) => candidates.map((c) => c.text)

describe("what the chat's @ offers", () => {
  test("the cursor's line, the selection, the file and the PR, then every file of the change in diff order", () => {
    expect(texts(chatAtCandidates(pr()))).toEqual([
      "@line",
      "@selection",
      "@file",
      "@pr",
      "@input/deeply/nested/other.ts",
      "@src/a/input.ts",
      "@old.ts",
    ])
  })

  test("no @pr in a local review, where it would stop the question", () => {
    expect(texts(chatAtCandidates(local()))).toEqual([
      "@line",
      "@selection",
      "@file",
      "@input/deeply/nested/other.ts",
      "@src/a/input.ts",
      "@old.ts",
    ])
  })

  test("files only from the change itself", () => {
    const none = createInitialState([], [], "local", "")
    expect(texts(chatAtCandidates(none))).toEqual(["@line", "@selection", "@file"])
  })

  test("a file's status and line counts as its detail", () => {
    const details = chatAtCandidates(local()).map((c) => c.detail)
    expect(details).toEqual([undefined, undefined, undefined, "M  +3 -1", "A  +12 -0", "D  +0 -7"])
  })

  test("a query ranks a file by its basename first", () => {
    const found = filterAtCandidates(chatAtCandidates(local()), "input", (c) => c.keys)
    expect(texts(found)).toEqual(["@src/a/input.ts", "@input/deeply/nested/other.ts"])
    expect(texts(filterAtCandidates(chatAtCandidates(pr()), "pr", (c) => c.keys))[0]).toBe("@pr")
  })
})
