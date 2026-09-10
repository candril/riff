import { test, expect, describe, beforeEach } from "bun:test"
import { DiffLineMapping } from "../../vim-diff/line-mapping"
import { handleFollowLink, type FollowLinkContext } from "./handlers"
import { createCursorState } from "../../vim-diff/cursor-state"
import type { VimCursorState } from "../../vim-diff/types"
import type { DiffFile } from "../../utils/diff-parser"

/**
 *  0 context  Decisions: [ADR-017](../decisions/ADR-017-alert.md).
 *  1 addition See src/app.ts:42 and https://x.test/why for the rest.
 */
const file: DiffFile = {
  filename: "docs/guides/import.md",
  additions: 1,
  deletions: 0,
  status: "modified",
  content: `diff --git a/docs/guides/import.md b/docs/guides/import.md
--- a/docs/guides/import.md
+++ b/docs/guides/import.md
@@ -1,1 +1,2 @@
 Decisions: [ADR-017](../decisions/ADR-017-alert.md).
+See src/app.ts:42 and https://x.test/why for the rest.`,
}

const mapping = new DiffLineMapping([file], "single", 0)

let cursor: VimCursorState
let jumped: { candidates: string[]; line?: number }[]
let opened: { candidates: string[]; line?: number; tmux: boolean }[]
let urls: string[]
let jumpSucceeds: boolean
let ctx: FollowLinkContext

function cursorOn(line: number, text: string): void {
  const col = mapping.getLineContent(line).indexOf(text)
  if (col < 0) throw new Error(`no ${text} on row ${line}`)
  cursor = { ...cursor, line, col }
}

beforeEach(() => {
  cursor = createCursorState()
  jumped = []
  opened = []
  urls = []
  jumpSucceeds = true

  ctx = {
    setState: () => {},
    getVimState: () => cursor,
    getLineMapping: () => mapping,
    render: () => {},
    jumpToFile: (candidates, line) => {
      jumped.push({ candidates, line })
      return jumpSucceeds
    },
    openPath: (candidates, line, tmux) => {
      opened.push({ candidates, line, tmux })
    },
    openUrl: (url) => {
      urls.push(url)
    },
  }
})

describe("following a link", () => {
  test("a relative link resolves against the file it is written in", () => {
    cursorOn(0, "ADR-017")
    handleFollowLink(ctx)

    expect(jumped).toEqual([{ candidates: ["docs/decisions/ADR-017-alert.md"], line: undefined }])
    expect(opened).toEqual([])
  })

  test("a target outside the diff is handed to the editor", () => {
    jumpSucceeds = false
    cursorOn(0, "decisions")
    handleFollowLink(ctx)

    expect(opened).toEqual([
      { candidates: ["docs/decisions/ADR-017-alert.md"], line: undefined, tmux: false },
    ])
  })

  test("a bare path carries its line number, and both readings of itself", () => {
    jumpSucceeds = false
    cursorOn(1, "src/app.ts")
    handleFollowLink(ctx)

    expect(opened).toEqual([
      { candidates: ["docs/guides/src/app.ts", "src/app.ts"], line: 42, tmux: false },
    ])
  })

  test("a url goes to the browser", () => {
    cursorOn(1, "x.test")
    handleFollowLink(ctx)

    expect(urls).toEqual(["https://x.test/why"])
    expect(jumped).toEqual([])
  })

  test("the tmux window skips the jump — the point is the other window", () => {
    cursorOn(0, "ADR-017")
    handleFollowLink(ctx, { tmux: true })

    expect(jumped).toEqual([])
    expect(opened).toEqual([
      { candidates: ["docs/decisions/ADR-017-alert.md"], line: undefined, tmux: true },
    ])
  })

  test("gx leaves a file alone", () => {
    cursorOn(0, "ADR-017")
    handleFollowLink(ctx, { urlsOnly: true })

    expect(jumped).toEqual([])
    expect(opened).toEqual([])
    expect(urls).toEqual([])
  })

  test("nothing under the cursor is nothing to follow", () => {
    cursorOn(0, "Decisions")
    handleFollowLink(ctx)

    expect(jumped).toEqual([])
    expect(opened).toEqual([])
    expect(urls).toEqual([])
  })
})
