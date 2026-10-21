import { test, expect } from "bun:test"
import { createKeyHandler, type GlobalKeyContext } from "./global-keys"
import { FEED_CHROME_ROWS, feedRowsInView } from "../components/feed-window"
import { createFeedState, createInitialState, visibleFeedRows, type AppState } from "../state"
import type { FeedEvent } from "../utils/feed"
import { createCursorState } from "../vim-diff/cursor-state"
import { createFlashState } from "../vim-diff/flash-state"
import { createSearchState } from "../vim-diff/search-state"

const comment = (i: number): FeedEvent => ({
  id: `c${i}`,
  type: "comment",
  at: "2026-03-01T12:00:00Z",
  title: `Note ${i}`,
  target: { kind: "comment", commentId: `c${i}` },
})

/**
 * Only what the `s` path uses; anything else it calls throws, so a new
 * dependency shows up here rather than as a silent stub.
 */
function keysFor(state: AppState, height: number) {
  const lists: { surface: string; ids: string[] }[] = []
  const known: Partial<GlobalKeyContext> = {
    getState: () => state,
    setState: (update) => (state = update(state)),
    getVimState: () => createCursorState(),
    getFlashState: () => createFlashState(),
    getSearchState: () => createSearchState(),
    renderer: { height },
    flashHandler: { startList: (surface: string, ids: string[]) => lists.push({ surface, ids }) } as never,
    render() {},
  }
  const ctx = new Proxy(known, {
    get(target, name) {
      if (name in target) return target[name as keyof GlobalKeyContext]
      // The handler copies some of ctx into its own contexts when it is built; only a call counts.
      return () => {
        throw new Error(`the s path called ctx.${String(name)}`)
      }
    },
  }) as GlobalKeyContext
  return { handle: createKeyHandler(ctx), lists }
}

test("s in the feed labels the rows the scrolled window shows, at the renderer's height", () => {
  const events = Array.from({ length: 40 }, (_, i) => comment(i))
  const state: AppState = {
    ...createInitialState([], [], "test", ""),
    viewMode: "feed",
    feed: { ...createFeedState(), events, highlightIndex: 39 },
  }
  const height = 10 + FEED_CHROME_ROWS
  const { handle, lists } = keysFor(state, height)

  handle({ name: "s", sequence: "s", ctrl: false, shift: false, meta: false, preventDefault() {} } as never)

  expect(lists).toHaveLength(1)
  expect(lists[0]!.surface).toBe("feed")
  expect(lists[0]!.ids).toEqual(feedRowsInView(visibleFeedRows(state), state.feed, height).map(String))
  expect(lists[0]!.ids).toEqual(Array.from({ length: 10 }, (_, i) => String(30 + i)))
})
