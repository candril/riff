/**
 * The activity feed's keys (viewMode "feed", specs 065, 070): `j/k` move
 * the highlight, `u` narrows to what is unseen, `Enter` opens the row, `Esc`
 * puts every narrowing back, `/` filters and the FEED_TYPES letters toggle
 * a type. While the filter prompt is up the feed holds every key, so its
 * field types them. `za` belongs to the `z` chords' keymap layer, which
 * owns `z`.
 *
 * The feed is a way in, not a second comments panel: `Enter` takes you where
 * the thing lives — a commit to the diff scoped to it, a comment to its
 * thread, a check to what it says — and the feed keeps its row so `a` comes
 * back to it.
 *
 * The capture holds exactly the keys the feed acts on, and leaves every
 * other key to the layers behind: the feed shares the screen with the
 * global keys, unlike the PR overview, which swallows what it does not
 * know.
 */

import type { KeyEvent } from "@opentui/core"
import type { RiffKeymap } from "../../app/keymap"
import { anyModifiers, without } from "../../app/key-variants"
import type { AppState } from "../../state"
import * as viewFilter from "../../app/view-filter"
import type { ActivityFeedState } from "./state"
import type { VisitState } from "../visit/state"
import type { FeedState } from "./types"
import { visibleFeedRows } from "./rows"
import { FEED_TYPES, type FeedEvent } from "../../utils/feed"

export interface FeedKeyDeps {
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
  feed: ActivityFeedState
  /** The last visit, whose unseen comments the feed's unseen-only filter keeps. */
  visit: Pick<VisitState, "watermark">
  /** Open what a row is about (spec 070). */
  onOpenEvent: (event: FeedEvent) => void
  /** Open the diff scoped to a commit, at one of its files. */
  onOpenCommitFile: (sha: string, filename: string) => void
  /** Whether a chord waits for its second key, which is the chord's rather than the feed's. */
  chordPending: () => boolean
}

type Key = Pick<KeyEvent, "name" | "sequence" | "shift" | "ctrl" | "meta">

const isSlash = (key: Key) => key.name === "/" || key.sequence === "/"

const narrowed = (feed: Pick<FeedState, "types" | "unseenOnly" | "filter">) => feed.types.size > 0 || feed.unseenOnly || feed.filter !== ""

/**
 * Whether the feed takes `key`. Names are compared exactly, so shift, super
 * and hyper are ignored, and a capitalised name such as kitty's Shift-g
 * ("G") matches nothing and goes to the layers behind.
 */
export function feedTakes(state: AppState, feed: FeedState, key: Key, chordPending: boolean): boolean {
  if (state.viewMode !== "feed") return false
  if (feed.filterInput) return true
  // Ctrl and meta keys belong to the global handler — Ctrl-p, Ctrl-f, the
  // jumplist — and the second half of a chord is the chord's: `gr` must
  // refresh, not toggle reviews.
  if (key.ctrl || key.meta || chordPending) return false
  switch (key.name) {
    case "j":
    case "down":
    case "k":
    case "up":
    case "u":
    case "return":
    case "enter":
      return true
    case "g":
      // `gg` and `G` are the global chords; a bare `g` starts one.
      return false
    case "escape":
      // With nothing narrowed Esc is the global Esc (a toast, say).
      return narrowed(feed)
  }
  if (isSlash(key) && !key.shift) return true
  return FEED_TYPES.some((entry) => entry.key === key.name)
}

export function registerFeedKeys(riffKeymap: RiffKeymap, deps: FeedKeyDeps): () => void {
  const feed = deps.feed
  const update = (run: () => void) => {
    run()
    deps.render()
  }

  const takes = (key: KeyEvent) => feedTakes(deps.getState(), feed.snapshot(), key, deps.chordPending())

  const startFilter = (key: KeyEvent) => {
    key.preventDefault()
    update(() => viewFilter.startFilter(deps))
  }

  // No preventDefault in the rest: the filter prompt's field types every
  // key it is not bound to. Only `/` by its sequence alone (the keypad's)
  // reaches here outside the prompt, since a binding takes every other key
  // the capture holds.
  const captured = riffKeymap.capture(takes, (key) => {
    if (!feed.filterInput() && isSlash(key)) startFilter(key)
  })

  const command = (name: string, title: string, run: (event: KeyEvent) => void) => ({
    name: `feed.${name}`,
    title,
    category: "Feed",
    palette: false as const,
    run: ({ event }: { event: KeyEvent }) => run(event),
  })
  const prevented = (run: () => void) => (event: KeyEvent) => {
    event.preventDefault()
    run()
  }
  // Each command prevents only where the feed always did: the keymap's
  // default would also stop the key the filter field types.
  const unprevented = (bindings: { key: string; cmd: string }[]) =>
    bindings.map((binding) => ({ ...binding, preventDefault: false }))

  const unregisterFilter = riffKeymap.keymap.registerLayer({
    enabled: () => captured.holds() && feed.filterInput(),
    commands: [
      command("filterClose", "Drop the filter", prevented(() => update(() => viewFilter.clearFilter(deps)))),
      command("filterCommit", "Keep the filter", prevented(() => update(() => viewFilter.commitFilter(deps)))),
    ],
    bindings: unprevented([
      ...anyModifiers("escape", "feed.filterClose"),
      ...anyModifiers("return", "feed.filterCommit"),
      ...anyModifiers("enter", "feed.filterCommit"),
    ]),
  })

  const rows = () => visibleFeedRows(feed.snapshot(), deps.getState().comments, deps.visit.watermark())

  const open = () => {
    const highlighted = rows()[feed.highlightIndex()]
    if (highlighted?.kind === "file") deps.onOpenCommitFile(highlighted.sha, highlighted.file.filename)
    else if (highlighted) deps.onOpenEvent(highlighted.event)
  }

  const move = (delta: number) => feed.move(delta, rows().length)

  // Ctrl and meta never reach these: the capture leaves them to the
  // layers behind.
  const plain = (key: string, cmd: string) => without(["ctrl", "meta"], anyModifiers(key, cmd))

  const unregisterMain = riffKeymap.keymap.registerLayer({
    enabled: () => captured.holds() && !feed.filterInput(),
    commands: [
      command("down", "Next row", () => update(() => move(1))),
      command("up", "Previous row", () => update(() => move(-1))),
      command("unseen", "Only what is unseen", () => update(feed.toggleUnseen)),
      command("open", "Open the row", open),
      // Only while something is narrowed, where the capture holds it.
      command("showAll", "Show every row", () => update(feed.showAll)),
      command("filter", "Filter the rows", startFilter),
      ...FEED_TYPES.map(({ key, type, label }) =>
        command(`type.${key}`, `Toggle ${label}`, () => update(() => feed.toggleType(type))),
      ),
    ],
    bindings: unprevented([
      ...plain("j", "feed.down"),
      ...plain("down", "feed.down"),
      ...plain("k", "feed.up"),
      ...plain("up", "feed.up"),
      ...plain("u", "feed.unseen"),
      ...plain("return", "feed.open"),
      ...plain("enter", "feed.open"),
      ...plain("escape", "feed.showAll"),
      ...without(["shift"], plain("/", "feed.filter")),
      ...FEED_TYPES.flatMap(({ key }) => plain(key, `feed.type.${key}`)),
    ]),
  })

  return () => {
    captured()
    unregisterFilter()
    unregisterMain()
  }
}
