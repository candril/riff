import { describe, expect, test } from "bun:test"
import { commentScope } from "../../diff-rows/comment-scope"
import { diffFile } from "../../diff-rows/fixtures"
import { RowLineSource } from "../../diff-rows/row-source"
import { createInitialState, openInlineCommentOverlay } from "../../state"
import { createCursorState } from "../../vim-diff/cursor-state"
import { DiffLineMapping } from "../../vim-diff/line-mapping"
import type { VimCursorState } from "../../vim-diff/types"
import { createComment } from "../../types"
import { blockAnchor } from "./block-anchor"
import { getCurrentComment, type CommentsContext } from "./handlers"

/** Old lines a b c d gone e; new lines a B C d e. */
const file = diffFile("s.ts", ["@@ -1,6 +1,5 @@", " a", "-b", "-c", "+B", "+C", " d", "-gone", " e"])
const mapping = new DiffLineMapping([file], "all")
const at = (content: string) => mapping.allLines.findIndex((line) => line.content === content)

const cursor = (line: number, selectionAnchor: number | null = null): VimCursorState => ({
  ...createCursorState(),
  line,
  mode: selectionAnchor === null ? "normal" : "visual-line",
  selectionAnchor,
})

/** What the comments panel opens on, the way `c` opens it. */
function open(state: VimCursorState, pane: "left" | "right" | null) {
  const rows = pane && new RowLineSource(mapping, "split", pane)
  const block = blockAnchor(mapping, commentScope(state, rows))
  if (!block) return null
  const { anchor, blockStart, anchorHash } = block
  const opened = openInlineCommentOverlay(
    createInitialState([file], [], "local", ""),
    anchor.filename, anchor.line, anchor.side, "compose", blockStart, undefined,
    { note: anchor.note, anchorHash },
  ).inlineCommentOverlay
  return { side: opened.side, line: opened.line, startLine: opened.startLine }
}

describe("blockAnchor", () => {
  test("a context line in the left pane opens the panel on the old side's line", () => {
    expect(open(cursor(at("e")), "left")).toEqual({ side: "LEFT", line: 6, startLine: undefined })
    expect(open(cursor(at("e")), "right")).toEqual({ side: "RIGHT", line: 5, startLine: undefined })
  })

  test("unified anchors a context line on the new side, as it always has", () => {
    expect(open(cursor(at("e")), null)).toEqual({ side: "RIGHT", line: 5, startLine: undefined })
  })

  test("a left-pane selection is a block of old lines, never reaching the additions", () => {
    expect(open(cursor(at("d"), at("b")), "left")).toEqual({ side: "LEFT", line: 4, startLine: 2 })
  })

  test("unified keeps a selection across sides to its first line", () => {
    expect(open(cursor(at("d"), at("b")), null)).toEqual({ side: "LEFT", line: 3, startLine: 2 })
  })

  test("the empty half of a row has nothing to open on", () => {
    expect(open(cursor(at("gone")), "right")).toBeNull()
  })

  test("a note is pinned to how the scope's last line reads", () => {
    const block = blockAnchor(mapping, commentScope(cursor(at("d"), at("b")), new RowLineSource(mapping, "split", "left")))
    expect(block?.anchorHash).toBe(mapping.hashAt(at("d")))
  })
})

describe("getCurrentComment", () => {
  const written = createComment(file.filename, 6, "why?", "LEFT", "@you")
  const ctx = (pane: "left" | "right"): CommentsContext =>
    ({
      getState: () => ({ ...createInitialState([file], [], "local", ""), comments: [written] }),
      getVimState: () => cursor(at("e")),
      getLineMapping: () => mapping,
      getCommentScope: () => commentScope(cursor(at("e")), new RowLineSource(mapping, "split", pane)),
    }) as CommentsContext

  test("a comment on a context line's old side is the cursor's in the left pane only", () => {
    expect(getCurrentComment(ctx("left"))?.id).toBe(written.id)
    expect(getCurrentComment(ctx("right"))).toBeNull()
  })
})
