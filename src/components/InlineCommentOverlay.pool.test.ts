import { test, expect } from "bun:test"
import type { CliRenderer } from "@opentui/core"
import { InlineCommentOverlay } from "./InlineCommentOverlay"
import { mountRenderable } from "../testing/frame"
import type { Comment } from "../types"

const SIZE = { width: 48, height: 20 }

const comment: Comment = {
  id: "a1",
  filename: "greet.ts",
  line: 3,
  side: "RIGHT",
  body: "Looks fine",
  createdAt: "2026-01-10T10:00:00Z",
  status: "synced",
  author: "alice",
}

const mountPanel = () =>
  mountRenderable(
    (renderer) =>
      InlineCommentOverlay({
        comments: [comment],
        scopeFilename: "greet.ts",
        composeFilename: "greet.ts",
        line: 3,
        replyToThread: false,
        note: false,
        mode: "view",
        appMode: "local",
        highlightedIndex: 0,
        editingId: null,
        draft: "",
        focused: false,
        expanded: false,
        width: SIZE.width,
        mentionPicker: null,
        emojiPicker: null,
        mentionCandidates: [],
        mentionSearchQuery: null,
        expandedThreadIds: new Set(),
        unseenIds: new Set(),
        filter: "",
        filterInput: false,
        flashLabels: new Map(),
        renderer: renderer as unknown as CliRenderer,
      }),
    SIZE
  )

test("a comment body belongs to the renderer drawing it, not to the first one that ever drew one", async () => {
  const first = await mountPanel()
  expect(await first.frame()).toContain("Looks fine")
  await first.dispose()

  const second = await mountPanel()
  const body = second.setup.renderer.root.findDescendantById("inline-overlay-body-a1")
  expect(body).toBeDefined()
  expect(body!.ctx).toBe(second.setup.renderer)
  expect(await second.frame()).toContain("Looks fine")
  await second.dispose()
})
