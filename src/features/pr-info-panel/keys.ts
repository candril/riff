/**
 * The PR overview's keys (viewMode "state"): `j/k` walk the sections,
 * `za`/`zm`/`zr` fold, `l/h` open and close a row, `Enter`/`o`/`y` act on
 * it, `c` comments, `x` resolves, `+` reacts, `/` filters, `gg`/`G` the
 * ends, and the `g` chords that reach the app. While it is the view the
 * panel swallows every key it does not know, bar any ctrl key and the few
 * `PASSES_THROUGH` names. What each key does is in `actions.ts`,
 * `row-actions.ts` and `comment-input.ts`.
 *
 * The bindings mirror checks that matched a key by name, in an order where
 * an earlier check won; which modifiers each one ignores is part of how
 * the panel has always behaved.
 */

import type { KeyEvent } from "@opentui/core"
import type { RiffKeymap } from "../../app/keymap"
import { anyModifiers, without } from "../../app/key-variants"
import { createPanelChords } from "./chords"
import * as act from "./actions"
import * as row from "./row-actions"
import * as comment from "./comment-input"

export type PRInfoPanelKeyDeps = act.PRInfoPanelDeps

/**
 * The keys the panel leaves to the chain in its main view: `q`/`Esc` quit
 * and clear toasts, `Tab` is the jumplist (terminals collapse Ctrl-I to
 * it), `i`/`a` the view router and `s` flash. A bare `d` is the view
 * router's too, except on a file row.
 */
const PASSES_THROUGH = new Set(["q", "escape", "tab", "i", "a", "s"])

const isPlus = (key: KeyEvent) => key.name === "+" || key.sequence === "+"
const isSlash = (key: KeyEvent) => key.name === "/" || key.sequence === "/"
// The panel compared names exactly, and none it knew had a capital; the
// keymap matches `G` as `g`, so a capitalised name runs as if unbound.
const capitalised = (key: KeyEvent) => key.name !== key.name.toLowerCase()

type Bindings = { key: string; cmd: string }[]

export function registerPrInfoPanelKeys(riffKeymap: RiffKeymap, deps: PRInfoPanelKeyDeps): () => void {
  const chords = createPanelChords(deps)
  const panelState = () => deps.getState().prInfoPanel

  /** Whether the panel takes `key`, read before it runs. */
  const takes = (key: KeyEvent) => {
    const state = deps.getState()
    if (state.viewMode !== "state") return false
    // The filter prompt and the comment prompt own every key, ctrl included;
    // the comment prompt even with the tree focused.
    if (state.prInfoPanel.filterInput || state.prInfoPanel.commentInputOpen) return true
    if (state.focusedPanel === "tree") return false
    // Ctrl-O (jumplist back), Ctrl-P (palette) and the chat's Ctrl-r reach
    // past the panel, and leave its chords pending.
    if (key.ctrl) return false
    if (chords.pending() || isPlus(key) || isSlash(key)) return true
    if (key.name === "d") return act.jumpsToFileOnRow(deps)
    return !PASSES_THROUGH.has(key.name)
  }

  /** A key the panel holds that no binding of its took. */
  const swallow = (key: KeyEvent) => {
    const panel = panelState()
    if (panel.filterInput) return
    if (panel.commentInputOpen) {
      // Typed into state, not into a focused field, so nothing to prevent.
      if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
        comment.typeIntoComment(deps, key.sequence)
      } else if (key.name === "j" && key.ctrl) {
        comment.newlineInComment(deps)
      }
      return
    }
    if (chords.consume(key)) return
    // `+` and `/` by spelling: under kitty Shift-= arrives named "=", and
    // the keypad's keys have names of their own.
    if (isPlus(key)) {
      key.preventDefault()
      act.react(deps)
    } else if (isSlash(key)) {
      key.preventDefault()
      act.startFilter(deps)
    }
  }

  // The panel mirrored its focus into the reaction target after every key
  // it took, for Ctrl+p → React… (spec 042).
  const synced = (key: KeyEvent, run: (key: KeyEvent) => void) => {
    run(key)
    act.syncReactionTarget(deps)
  }

  // No preventDefault in the rest: the filter prompt's field types every
  // key it is not bound to, and the panel never prevented a key it swallowed.
  const captured = riffKeymap.capture(takes, (key) => synced(key, swallow))

  const command = (name: string, title: string, run: (event: KeyEvent) => void) => ({
    name: `prInfoPanel.${name}`,
    title,
    category: "PR",
    palette: false as const,
    run: ({ event }: { event: KeyEvent }) => synced(event, capitalised(event) ? swallow : run),
  })
  const prevented = (run: (event: KeyEvent) => void) => (event: KeyEvent) => {
    event.preventDefault()
    run(event)
  }
  // Each command prevents only where the panel always did: the keymap's
  // default would also stop the key the filter field types.
  const unprevented = (bindings: Bindings) => bindings.map((binding) => ({ ...binding, preventDefault: false }))

  const unregisterFilter = riffKeymap.keymap.registerLayer({
    enabled: () => captured.holds() && panelState().filterInput,
    commands: [
      command("filterClose", "Drop the filter", prevented(() => act.closeFilter(deps))),
      command("filterCommit", "Keep the filter", prevented(() => act.commitFilter(deps))),
    ],
    bindings: unprevented([
      ...anyModifiers("escape", "prInfoPanel.filterClose"),
      ...anyModifiers("return", "prInfoPanel.filterCommit"),
      ...anyModifiers("enter", "prInfoPanel.filterCommit"),
    ]),
  })

  const unregisterComment = riffKeymap.keymap.registerLayer({
    enabled: () => captured.holds() && panelState().commentInputOpen && !panelState().filterInput,
    commands: [
      command("commentClose", "Drop the comment", () => comment.closeCommentInput(deps)),
      command("commentSubmit", "Post the comment", () => comment.submitComment(deps)),
      command("commentDelete", "Delete a character", () => comment.deleteCommentChar(deps)),
    ],
    bindings: unprevented([
      ...anyModifiers("escape", "prInfoPanel.commentClose"),
      ...anyModifiers("return", "prInfoPanel.commentSubmit"),
      ...anyModifiers("enter", "prInfoPanel.commentSubmit"),
      ...anyModifiers("backspace", "prInfoPanel.commentDelete"),
    ]),
  })

  // A pending chord takes the next key in the rest, ahead of every binding here.
  const unregisterMain = riffKeymap.keymap.registerLayer({
    enabled: () => {
      const panel = panelState()
      return captured.holds() && !panel.filterInput && !panel.commentInputOpen && !chords.pending()
    },
    commands: [
      command("react", "React to the focused item", prevented(() => act.react(deps))),
      command("filter", "Filter the rows", prevented(() => act.startFilter(deps))),
      command("comment", "Comment on the PR", () => act.openCommentInput(deps)),
      command("expandItem", "Open the row", () => act.expandItem(deps)),
      command("collapseItem", "Close the row", () => act.collapseItem(deps)),
      command("resolve", "Resolve or reopen the thread", () => act.toggleResolved(deps)),
      command("armZ", "Start a z chord", () => chords.armZ()),
      command("activate", "Act on the row", (event) => row.activate(deps, event)),
      command("open", "Open the row in the browser", (event) => row.openFocused(deps, event)),
      command("copy", "Copy what the row names", (event) => row.copyFocused(deps, event)),
      command("copyAll", "Copy every link on the row, or the PR URL", () => row.copyAll(deps)),
      command("down", "Next row", () => act.moveDown(deps)),
      command("up", "Previous row", () => act.moveUp(deps)),
      command("diffAtFile", "The diff at this file", () => act.jumpToFileOnRow(deps)),
      command("armG", "Start a g chord", () => chords.armG()),
      command("end", "Scroll to the end", () => act.scrollBottom(deps)),
    ],
    // Ctrl never reaches these: the capture leaves every ctrl key to the chain.
    bindings: unprevented([
      ...anyModifiers("+", "prInfoPanel.react"),
      ...anyModifiers("/", "prInfoPanel.filter"),
      ...anyModifiers("c", "prInfoPanel.comment"),
      ...anyModifiers("l", "prInfoPanel.expandItem"),
      ...anyModifiers("h", "prInfoPanel.collapseItem"),
      ...anyModifiers("x", "prInfoPanel.resolve"),
      ...anyModifiers("z", "prInfoPanel.armZ"),
      ...anyModifiers("return", "prInfoPanel.activate"),
      ...anyModifiers("enter", "prInfoPanel.activate"),
      ...anyModifiers("o", "prInfoPanel.open"),
      ...without(["shift"], anyModifiers("y", "prInfoPanel.copy")),
      ...anyModifiers("shift+y", "prInfoPanel.copyAll"),
      ...anyModifiers("j", "prInfoPanel.down"),
      ...anyModifiers("down", "prInfoPanel.down"),
      ...anyModifiers("k", "prInfoPanel.up"),
      ...anyModifiers("up", "prInfoPanel.up"),
      // Only on a file row, where the capture holds it.
      ...anyModifiers("d", "prInfoPanel.diffAtFile"),
      ...without(["shift"], anyModifiers("g", "prInfoPanel.armG")),
      ...anyModifiers("shift+g", "prInfoPanel.end"),
    ]),
  })

  return () => {
    captured()
    unregisterFilter()
    unregisterComment()
    unregisterMain()
    chords.dispose()
  }
}
