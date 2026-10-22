import { test, expect, afterEach } from "bun:test"
import { KeyEvent } from "@opentui/core"
import { createTestRenderer } from "@opentui/core/testing"
import type { GlobalKeyContext } from "./global-keys"
import { createRiffKeymap } from "./keymap"
import { registerGlobalKeys } from "./global-layer-keys"
import { globalLayerKeyDeps } from "./global-layer-key-deps"
import { FEED_CHROME_ROWS } from "../components/feed-window"
import { createFeedState, createInitialState, type AppState } from "../state"
import type { FeedEvent } from "../utils/feed"
import { createCursorState } from "../vim-diff/cursor-state"
import { createFlashState } from "../vim-diff/flash-state"
import { createSearchState } from "../vim-diff/search-state"

const disposers: (() => void)[] = []
afterEach(() => {
  while (disposers.length) disposers.pop()!()
})

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
async function keysFor(state: AppState, height: number) {
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
      // The deps copy some of ctx into their own contexts when they are built; only a call counts.
      return () => {
        throw new Error(`the s path called ctx.${String(name)}`)
      }
    },
  }) as GlobalKeyContext
  const { renderer } = await createTestRenderer({ width: 20, height: 4 })
  disposers.push(() => renderer.destroy())
  const riffKeymap = createRiffKeymap(renderer)
  registerGlobalKeys(riffKeymap, globalLayerKeyDeps(ctx, { chordPendingAfter: () => false, settleChord() {} }))
  return { offer: (key: KeyEvent) => riffKeymap.offer(key), lists }
}

test("s in the feed labels the rows the scrolled window shows, at the renderer's height", async () => {
  const events = Array.from({ length: 40 }, (_, i) => comment(i))
  const state: AppState = {
    ...createInitialState([], [], "test", ""),
    viewMode: "feed",
    feed: { ...createFeedState(), events, highlightIndex: 39 },
  }
  const height = 10 + FEED_CHROME_ROWS
  const { offer, lists } = await keysFor(state, height)

  offer(
    new KeyEvent({ name: "s", ctrl: false, meta: false, shift: false, option: false, sequence: "s", number: false, raw: "s", eventType: "press", source: "raw" }),
  )

  expect(lists).toHaveLength(1)
  expect(lists[0]!.surface).toBe("feed")
  // 40 rows, the last highlighted, 10 body rows: the window ends on the highlight.
  expect(lists[0]!.ids).toEqual(["30", "31", "32", "33", "34", "35", "36", "37", "38", "39"])
})
