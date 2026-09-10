import { test, expect, describe } from "bun:test"
import {
  createInitialState,
  switchView,
  selectFile,
  filterTarget,
  startViewFilter,
  setViewFilter,
  commitViewFilter,
  clearViewFilter,
  openInlineCommentOverlay,
  toggleFeedType,
  showAllFeedTypes,
  type AppState,
} from "./state"
import type { DiffFile } from "./utils/diff-parser"

const file: DiffFile = {
  filename: "a.ts",
  additions: 1,
  deletions: 0,
  status: "modified",
  content: "diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1,1 +1,2 @@\n const one = 1\n+const two = 2",
}

function prState(): AppState {
  return createInitialState([file], [], "gh:o/r#1", "#1: a PR", null, null, [], "pr", null)
}

describe("moving between the three surfaces", () => {
  test("a PR opens on its state, every time", () => {
    expect(prState().viewMode).toBe("state")
    expect(prState().previousView).toBeNull()
  })

  test("the key of the view you are in takes you back where you came from", () => {
    const diff = switchView(prState(), "diff")
    expect(diff.viewMode).toBe("diff")

    const feed = switchView(diff, "feed")
    expect(feed.viewMode).toBe("feed")

    // `a` again — back to the diff, not to the state view it started in.
    const back = switchView(feed, "feed")
    expect(back.viewMode).toBe("diff")
  })

  test("one slot of history, so pressing the same key twice returns", () => {
    const there = switchView(switchView(prState(), "diff"), "diff")
    const andBack = switchView(there, "diff")

    expect(there.viewMode).toBe("state")
    expect(andBack.viewMode).toBe("diff")
  })

  test("the view you are already in with nowhere to go back to stays put", () => {
    const state = prState()
    expect(switchView(state, "state")).toBe(state)
  })

  test("the diff keeps the file it was scoped to while you are elsewhere", () => {
    const onFile = selectFile(switchView(prState(), "diff"), 0)
    const away = switchView(onFile, "state")

    expect(away.selectedFileIndex).toBe(0)
    expect(switchView(away, "diff").selectedFileIndex).toBe(0)
  })

  test("local mode has only the diff", () => {
    const local = createInitialState([file], [], "local", "local changes")

    expect(local.viewMode).toBe("diff")
    expect(switchView(local, "state")).toBe(local)
    expect(switchView(local, "feed")).toBe(local)
  })
})

describe("what Ctrl-f narrows", () => {
  test("the file tree, when the diff has focus", () => {
    const state = switchView(prState(), "diff")

    expect(filterTarget(state)).toBe("tree")
    const filtering = startViewFilter(state)
    expect(filtering.treeFilterInput).toBe(true)
    // A hidden tree cannot show what the filter left.
    expect(filtering.showFilePanel).toBe(true)
    expect(setViewFilter(filtering, "limiter").treeFilter).toBe("limiter")
  })

  test("the info panel's rows, in the state view", () => {
    const state = prState()

    expect(filterTarget(state)).toBe("state")
    const filtering = setViewFilter(startViewFilter(state), "client")
    expect(filtering.prInfoPanel.filterInput).toBe(true)
    expect(filtering.prInfoPanel.filter).toBe("client")
    expect(clearViewFilter(filtering).prInfoPanel).toMatchObject({ filter: "", filterInput: false })
  })

  test("the feed's rows, in the feed", () => {
    const state = switchView(prState(), "feed")

    expect(filterTarget(state)).toBe("feed")
    const filtering = setViewFilter(startViewFilter(state), "carol")
    expect(filtering.feed).toMatchObject({ filter: "carol", filterInput: true, highlightIndex: 0 })
  })

  test("the comments panel, while it holds the keyboard", () => {
    const state = {
      ...openInlineCommentOverlay(switchView(prState(), "diff"), "a.ts", 1, "RIGHT", "view"),
      focusedPanel: "comments" as const,
    }

    expect(filterTarget(state)).toBe("comments")
    const filtering = setViewFilter(startViewFilter(state), "naming")
    expect(filtering.inlineCommentOverlay).toMatchObject({ filter: "naming", filterInput: true })
  })

  test("Enter keeps what the filter left, Escape drops it", () => {
    const filtering = setViewFilter(startViewFilter(prState()), "client")

    expect(commitViewFilter(filtering).prInfoPanel).toMatchObject({
      filter: "client",
      filterInput: false,
    })
    expect(clearViewFilter(filtering).prInfoPanel.filter).toBe("")
  })
})

describe("the feed's filters", () => {
  test("a letter toggles its type, and `a` puts everything back", () => {
    const narrowed = toggleFeedType(switchView(prState(), "feed"), "commit")
    expect(narrowed.feed.types).toEqual(new Set(["commit"]))
    expect(toggleFeedType(narrowed, "commit").feed.types.size).toBe(0)

    const all = showAllFeedTypes(setViewFilter(startViewFilter(narrowed), "x"))
    expect(all.feed).toMatchObject({ types: new Set(), unseenOnly: false, filter: "" })
  })
})
