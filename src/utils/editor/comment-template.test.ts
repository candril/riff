import { test, expect, describe } from "bun:test"
import { createComment } from "../../types"
import {
  MARKER_COMMENT_END,
  buildCommentFileContent,
  buildDraftFileContent,
  parseEditorOutput,
  parsePrCommentOutput,
  prCommentFileContent,
} from "./comment-template"

const diff = ["@@ -1,2 +1,2 @@", " keep", "-old", "+new"].join("\n")

/** What the reader does in the editor: type at the top, above the marker. */
function typeAboveMarker(buffer: string, text: string): string {
  return text + buffer
}

describe("the comment buffer", () => {
  test("text typed above the marker comes back as the new reply", () => {
    const buffer = buildCommentFileContent({ diffContent: diff, filePath: "src/a.ts", line: 3 })

    expect(parseEditorOutput(typeAboveMarker(buffer, "looks wrong")).newReply).toBe("looks wrong")
  })

  test("an own comment edited in an editable thread comes back under its id", () => {
    const mine = { ...createComment("src/a.ts", 3, "first take"), id: "gh-42" }
    const buffer = buildCommentFileContent({
      diffContent: diff,
      filePath: "src/a.ts",
      line: 3,
      thread: [mine],
      username: "@you",
    })
    expect(buffer).toContain("edit:gh-42")

    const result = parseEditorOutput(buffer.replace("first take", "second take"))

    expect(result.newReply).toBe("")
    expect(result.editedComments.get("gh-42")).toBe("second take")
  })
})

describe("the composer's draft buffer", () => {
  test("left unedited, it gives back the draft it was seeded with", () => {
    const thread = [createComment("src/a.ts", 3, "earlier note", "RIGHT", "someone")]
    const buffer = buildDraftFileContent("my draft\nsecond line", {
      filePath: "src/a.ts",
      line: 3,
      side: "RIGHT",
      fullDiff: diff,
      thread,
    })

    expect(parseEditorOutput(buffer).newReply).toBe("my draft\nsecond line")
  })
})

describe("the PR conversation comment buffer", () => {
  test("text added above the marker is the comment", () => {
    const buffer = prCommentFileContent()
    expect(buffer).toContain(MARKER_COMMENT_END)

    expect(parsePrCommentOutput(typeAboveMarker(buffer, "ship it"))).toBe("ship it")
  })

  test("left untouched, there is no comment", () => {
    expect(parsePrCommentOutput(prCommentFileContent())).toBeNull()
  })
})
