import { test, expect, describe } from "bun:test"
import { createInitialState, filterTarget, openInlineCommentOverlay, switchView, type AppState } from "../state"
import type { DiffFile } from "../utils/diff-parser"
import * as viewFilter from "./view-filter"

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

function filtering(initial: AppState) {
  let state = initial
  const ctx: viewFilter.ViewFilterContext = {
    getState: () => state,
    setState: (update) => {
      state = update(state)
    },
  }
  return { ctx, state: () => state }
}

describe("what Ctrl-f narrows", () => {
  test("the file tree, when the diff has focus", () => {
    const { ctx, state } = filtering(switchView(prState(), "diff"))

    expect(filterTarget(state())).toBe("tree")
    viewFilter.startFilter(ctx)
    expect(state().treeFilterInput).toBe(true)
    // A hidden tree cannot show what the filter left.
    expect(state().showFilePanel).toBe(true)
    viewFilter.setFilter(ctx, "limiter")
    expect(state().treeFilter).toBe("limiter")
  })

  test("the info panel's rows, in the state view", () => {
    const { ctx, state } = filtering(prState())

    expect(filterTarget(state())).toBe("state")
    viewFilter.startFilter(ctx)
    viewFilter.setFilter(ctx, "client")
    expect(state().prInfoPanel.filterInput).toBe(true)
    expect(state().prInfoPanel.filter).toBe("client")
    viewFilter.clearFilter(ctx)
    expect(state().prInfoPanel).toMatchObject({ filter: "", filterInput: false })
  })

  test("the feed's rows, in the feed", () => {
    const initial = switchView(prState(), "feed")
    const { ctx, state } = filtering({ ...initial, feed: { ...initial.feed, highlightIndex: 3 } })

    expect(filterTarget(state())).toBe("feed")
    viewFilter.startFilter(ctx)
    viewFilter.setFilter(ctx, "carol")
    expect(state().feed).toMatchObject({ filter: "carol", filterInput: true, highlightIndex: 0 })
    viewFilter.commitFilter(ctx)
    expect(state().feed).toMatchObject({ filter: "carol", filterInput: false })
    viewFilter.clearFilter(ctx)
    expect(state().feed).toMatchObject({ filter: "", filterInput: false })
  })

  test("the comments panel, while it holds the keyboard", () => {
    const { ctx, state } = filtering({
      ...openInlineCommentOverlay(switchView(prState(), "diff"), "a.ts", 1, "RIGHT", "view"),
      focusedPanel: "comments" as const,
    })

    expect(filterTarget(state())).toBe("comments")
    viewFilter.startFilter(ctx)
    viewFilter.setFilter(ctx, "naming")
    expect(state().inlineCommentOverlay).toMatchObject({ filter: "naming", filterInput: true })
  })

  test("Enter keeps what the filter left, Escape drops it", () => {
    const kept = filtering(prState())
    viewFilter.startFilter(kept.ctx)
    viewFilter.setFilter(kept.ctx, "client")
    viewFilter.commitFilter(kept.ctx)
    expect(kept.state().prInfoPanel).toMatchObject({ filter: "client", filterInput: false })

    const dropped = filtering(prState())
    viewFilter.startFilter(dropped.ctx)
    viewFilter.setFilter(dropped.ctx, "client")
    viewFilter.clearFilter(dropped.ctx)
    expect(dropped.state().prInfoPanel.filter).toBe("")
  })
})

describe("stateFilterTarget", () => {
  test("names the surface for the overview's and the thread panel's keys", () => {
    expect(viewFilter.stateFilterTarget(prState())).toBe("state")
  })

  test("refuses the feed, whose filter is set apart", () => {
    expect(() => viewFilter.stateFilterTarget(switchView(prState(), "feed"))).toThrow()
  })
})
