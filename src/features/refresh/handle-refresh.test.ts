import { describe, expect, test } from "bun:test"
import { treeRowsOf } from "../../components/FileTree"
import type { AppState } from "../../state"
import type { FileReviewStatus } from "../../types"
import { deferred, refreshHarness } from "../../testing/refresh-harness"
import { handleRefresh } from "./handlers"

const highlighted = (state: AppState) => treeRowsOf(state)[state.treeHighlightIndex]?.node.path

/** A refresh swallows its own errors into a toast, which would pass a test for the wrong reason. */
async function landed(refreshing: Promise<void>, state: () => AppState) {
  await refreshing
  expect(state().toast).toMatchObject({ type: "success" })
}

describe("a refresh's tree highlight", () => {
  for (const appMode of ["pr", "local"] as const) {
    test(`moved while the viewed states load, stays on the moved-to file (${appMode})`, async () => {
      const reached = deferred<void>()
      const statuses = deferred<FileReviewStatus[]>()
      const { ctx, state } = refreshHarness({
        appMode,
        state: (s) => ({ ...s, treeUnviewedOnly: true, treeHighlightIndex: 0 }),
        sources: {
          loadViewedStatuses: () => {
            reached.resolve()
            return statuses.promise
          },
        },
      })
      expect(highlighted(state())).toBe("a.ts")

      const refreshing = handleRefresh(ctx)
      await reached.promise
      // `j` twice in the tree.
      ctx.setState((s) => ({ ...s, treeHighlightIndex: 2 }))
      expect(highlighted(state())).toBe("c.ts")
      // Hides a row above the highlight.
      statuses.resolve([{ filename: "a.ts", viewed: true }])
      await landed(refreshing, state)

      expect(highlighted(state())).toBe("c.ts")
    })
  }
})

describe("a refresh's feed", () => {
  test("a PR refresh drops the stream, and re-reads the timeline only while the feed is on screen", async () => {
    for (const [viewMode, reloads] of [["diff", 0], ["feed", 1]] as const) {
      const { ctx, calls, state } = refreshHarness({ state: (s) => ({ ...s, viewMode }) })
      await landed(handleRefresh(ctx), state)
      expect(calls.forgetStream).toBe(1)
      expect(calls.reloadFeed).toBe(reloads)
    }
  })
})

describe("a refresh's overlays", () => {
  for (const appMode of ["pr", "local"] as const) {
    test(`closes the help (${appMode})`, async () => {
      const { ctx, help, state } = refreshHarness({ appMode })
      help.toggle()
      await landed(handleRefresh(ctx), state)
      expect(help.open()).toBe(false)
    })
  }
})
