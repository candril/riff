/**
 * The thread panel's keys in view mode (spec 039): `j/k` highlight,
 * `Ctrl-d`/`Ctrl-u` half a page, `gg`/`G` the ends, `r/R` reply, `e/E`
 * edit, `d` delete, `x` resolve, `H` open threads only, `S` submit,
 * `J`/`Ctrl-n` the next thread, `K` the previous one, `Esc` closes. While
 * the panel has focus it owns the keyboard, bar the few keys
 * `passesThrough` names. What each key does is in `view-actions.ts`; the
 * composer's keys are in `composer-keys.ts`.
 *
 * The bindings mirror checks that matched a key by name, in an order where
 * an earlier check won: which modifiers each one ignores is part of how
 * the panel has always behaved, Ctrl-j moving the highlight among them.
 */

import type { KeyEvent } from "@opentui/core"
import type { RiffKeymap } from "../../app/keymap"
import { anyModifiers, without } from "../../app/key-variants"
import { threadPanelHoldsKeys } from "../../app/diff-focus"
import { chatStandsAside, type ChatAsideInputs } from "../chat/keys"
import type { AppState } from "../../state"
import type { Comment } from "../../types"
import { createPanelChords } from "./view-chords"
import * as act from "./view-actions"

export interface ThreadPanelKeyDeps extends act.ThreadPanelViewDeps, ChatAsideInputs {
  /** Whether the diff's search prompt is up, under which the chat stands aside. */
  searchActive: () => boolean
}

/**
 * The keys the panel leaves to riff's other handlers. Ctrl-r, and Ctrl-l
 * with the chat open, are the chat's reach: they pass wherever the
 * chat takes them, and where it stands aside, under the panel's own filter
 * prompt for one, the panel keeps them. Ctrl-p, Ctrl-f and a bare `s` are
 * the palette's, the file picker's and flash's, Ctrl-o and Tab (which is
 * Ctrl-i) walk the jumplist, and only the filter prompt and the code peek
 * keep those.
 */
function passesThrough(key: KeyEvent, state: AppState, searchActive: boolean, inputs: ChatAsideInputs): boolean {
  const chatReaches = !chatStandsAside(state, searchActive, inputs)
  if (key.ctrl && key.name === "r") return chatReaches
  if (key.ctrl && key.name === "l") return chatReaches && state.chatOpen
  const ov = state.inlineCommentOverlay
  if (ov.filterInput || ov.codePeekId !== null) return false
  if (key.ctrl && (key.name === "p" || key.name === "f" || key.name === "o")) return true
  if (key.name === "tab" && !key.shift) return true
  return key.name === "s" && !key.ctrl && !key.shift
}

const isBareS = (key: KeyEvent) => key.name === "s" && !key.ctrl && !key.shift

type Bindings = { key: string; cmd: string }[]

export function registerThreadPanelKeys(riffKeymap: RiffKeymap, deps: ThreadPanelKeyDeps): () => void {
  const chords = createPanelChords(deps)
  const viewing = () => threadPanelHoldsKeys(deps.getState())
  const inMainView = () => {
    const ov = deps.getState().inlineCommentOverlay
    return !ov.filterInput && ov.codePeekId === null
  }

  // No preventDefault in the rest: the filter prompt's field types every
  // key it is not bound to, and riff never prevented the keys it swallowed.
  const captured = riffKeymap.capture(
    (key) => {
      if (!viewing()) return false
      if (!passesThrough(key, deps.getState(), deps.searchActive(), deps)) return true
      // A pending `g` swallows the `s` that would go to flash; a pending
      // `z` is broken off by it, as by any key but `a`.
      if (isBareS(key)) {
        if (chords.gPending()) return true
        chords.dropZ()
      }
      return false
    },
    (key) => {
      if (!inMainView()) return
      // The panel matched `/` and `+` by spelling as well as by name: under
      // kitty Shift-= arrives named "=", and the keypad's keys have names
      // of their own. These run where their bindings sit, `/` ahead of the
      // chords and `+` after them.
      if (key.sequence === "/" && !key.ctrl) {
        key.preventDefault()
        act.startFilter(deps)
        return
      }
      if (chords.consume(key)) return
      if (key.sequence === "+") {
        key.preventDefault()
        act.react(deps)
      }
    },
  )

  // `keys`: how the palette spells the key, for a command an action names.
  const command = (name: string, title: string, run: (event: KeyEvent) => void, keys?: string) => ({
    name: `threadPanel.${name}`,
    title,
    keys,
    category: "Comments",
    palette: false as const,
    run: ({ event }: { event: KeyEvent }) => run(event),
  })
  // For a key the panel always checked after its chords: a pending `za` or
  // `g` takes it first.
  const afterChords = (name: string, title: string, run: (event: KeyEvent) => void, keys?: string) =>
    command(
      name,
      title,
      (event) => {
        if (!chords.consume(event)) run(event)
      },
      keys,
    )
  /** With the highlighted comment, if there is one. */
  const onHighlighted = (run: (comment: Comment, event: KeyEvent) => void) => (event: KeyEvent) => {
    const highlighted = act.highlightedComment(deps.getState())
    if (highlighted) run(highlighted, event)
  }
  const prevented = (run: (event: KeyEvent) => void) => (event: KeyEvent) => {
    event.preventDefault()
    run(event)
  }
  // Each command prevents only where the panel always did: the keymap's
  // default would also stop the key the filter field types.
  const unprevented = (bindings: Bindings) => bindings.map((binding) => ({ ...binding, preventDefault: false }))

  const unregisterFilter = riffKeymap.keymap.registerLayer({
    enabled: () => captured.holds() && deps.getState().inlineCommentOverlay.filterInput,
    commands: [
      command("filterClose", "Drop the filter", prevented(() => act.closeFilter(deps))),
      command("filterCommit", "Keep the filter", prevented(() => act.commitFilter(deps))),
    ],
    bindings: unprevented([
      ...anyModifiers("escape", "threadPanel.filterClose"),
      ...anyModifiers("return", "threadPanel.filterCommit"),
      ...anyModifiers("enter", "threadPanel.filterCommit"),
    ]),
  })

  const unregisterPeek = riffKeymap.keymap.registerLayer({
    enabled: () => {
      const ov = deps.getState().inlineCommentOverlay
      return captured.holds() && ov.codePeekId !== null && !ov.filterInput
    },
    commands: [command("peekClose", "Close the code peek", () => act.closeCodePeek(deps))],
    bindings: unprevented([
      ...anyModifiers("escape", "threadPanel.peekClose"),
      ...anyModifiers("q", "threadPanel.peekClose"),
      ...anyModifiers("c", "threadPanel.peekClose"),
    ]),
  })

  const unregisterMain = riffKeymap.keymap.registerLayer({
    enabled: () => captured.holds() && inMainView(),
    commands: [
      command("focusDiff", "Back to the diff", () => act.focusDiff(deps)),
      command("expand", "Widen or narrow the panel", () => act.toggleExpanded(deps)),
      command("filter", "Filter the comments", prevented(() => act.startFilter(deps))),
      command("copyLink", "Copy a link to the comment", () => act.copyLink(deps), "y (comments panel)"),
      command("toggle", "Close the panel", () => act.closePanel(deps)),
      command("halfDown", "Down half a page", () => act.halfPage(deps, 1)),
      command("halfUp", "Up half a page", () => act.halfPage(deps, -1)),
      command("close", "Close the panel", () => {
        chords.dropZ()
        act.closePanel(deps)
      }),
      command("armZ", "Start a z chord", (event) => {
        if (!chords.consumeZ(event)) chords.armZ()
      }),
      afterChords("armG", "Start a g chord", () => chords.armG()),
      afterChords("openOnly", "Show open threads only", () => act.toggleOpenOnly(deps), "H (comments panel)"),
      afterChords("end", "Last comment", () => act.jumpToEnd(deps)),
      afterChords("thread", "Open or fold the thread", () => act.toggleHighlightedThread(deps)),
      afterChords("react", "React to the comment", prevented(() => act.react(deps)), "+"),
      afterChords("down", "Next comment", () => act.moveHighlight(deps, 1)),
      afterChords("up", "Previous comment", () => act.moveHighlight(deps, -1)),
      afterChords("nextThread", "Next thread", () => act.jumpAdjacent(deps, 1)),
      afterChords("previousThread", "Previous thread", () => act.jumpAdjacent(deps, -1)),
      afterChords("new", "New comment at the diff cursor", prevented(() => act.startNew(deps))),
      afterChords("reply", "Reply", prevented(() => act.replyInline(deps))),
      afterChords("replyInEditor", "Reply in $EDITOR", () => act.replyInEditor(deps)),
      afterChords("edit", "Edit the comment", onHighlighted((comment, event) => {
        event.preventDefault()
        act.editInline(deps, comment)
      })),
      afterChords("editInEditor", "Edit in $EDITOR", () => act.editInEditor(deps)),
      afterChords("delete", "Delete the comment", () => act.deleteHighlighted(deps), "d"),
      afterChords("resolve", "Resolve or reopen the thread", () => act.toggleResolved(deps)),
      afterChords("submit", "Post the comment", () => act.submit(deps), "S"),
      afterChords("codePeek", "Show the code the comment was written against", onHighlighted((comment, event) => {
        event.preventDefault()
        act.openCodePeek(deps, comment)
      })),
      afterChords("openInEditor", "Open the file in $EDITOR", prevented(onHighlighted((comment) => act.openInEditor(deps, comment)))),
      afterChords("openImages", "Open the comment's images", prevented(onHighlighted((comment) => act.openImages(deps, comment)))),
    ],
    bindings: unprevented([
      // Terminals deliver bare Ctrl-h as backspace; kitty-protocol ones keep the h.
      ...anyModifiers("backspace", "threadPanel.focusDiff"),
      ...anyModifiers("ctrl+h", "threadPanel.focusDiff"),
      ...anyModifiers("ctrl+e", "threadPanel.expand"),
      ...without(["ctrl"], anyModifiers("/", "threadPanel.filter")),
      ...without(["ctrl"], anyModifiers("y", "threadPanel.copyLink")),
      ...anyModifiers("ctrl+t", "threadPanel.toggle"),
      ...anyModifiers("ctrl+d", "threadPanel.halfDown"),
      ...anyModifiers("ctrl+u", "threadPanel.halfUp"),
      ...anyModifiers("escape", "threadPanel.close"),
      ...without(["ctrl", "shift", "meta"], anyModifiers("q", "threadPanel.close")),
      ...without(["ctrl", "shift"], anyModifiers("z", "threadPanel.armZ")),
      ...without(["ctrl", "shift"], anyModifiers("g", "threadPanel.armG")),
      ...without(["ctrl", "meta"], anyModifiers("shift+h", "threadPanel.openOnly")),
      ...without(["ctrl"], anyModifiers("shift+g", "threadPanel.end")),
      ...anyModifiers("return", "threadPanel.thread"),
      ...anyModifiers("enter", "threadPanel.thread"),
      ...anyModifiers("+", "threadPanel.react"),
      ...without(["shift"], anyModifiers("j", "threadPanel.down")),
      ...without(["shift"], anyModifiers("down", "threadPanel.down")),
      ...anyModifiers("shift+j", "threadPanel.nextThread"),
      ...anyModifiers("shift+down", "threadPanel.nextThread"),
      ...without(["shift"], anyModifiers("k", "threadPanel.up")),
      ...without(["shift"], anyModifiers("up", "threadPanel.up")),
      ...anyModifiers("shift+k", "threadPanel.previousThread"),
      ...anyModifiers("shift+up", "threadPanel.previousThread"),
      // Shift-n is swallowed.
      ...anyModifiers("ctrl+n", "threadPanel.nextThread"),
      ...without(["ctrl", "shift"], anyModifiers("n", "threadPanel.new")),
      ...without(["shift"], anyModifiers("r", "threadPanel.reply")),
      ...anyModifiers("shift+r", "threadPanel.replyInEditor"),
      ...without(["ctrl", "shift"], anyModifiers("e", "threadPanel.edit")),
      ...without(["ctrl"], anyModifiers("shift+e", "threadPanel.editInEditor")),
      ...without(["ctrl"], anyModifiers("d", "threadPanel.delete")),
      ...anyModifiers("x", "threadPanel.resolve"),
      // Ctrl-s is swallowed; a bare s is flash's.
      ...anyModifiers("shift+s", "threadPanel.submit"),
      ...without(["ctrl", "shift"], anyModifiers("c", "threadPanel.codePeek")),
      ...without(["ctrl", "shift"], anyModifiers("o", "threadPanel.openInEditor")),
      ...without(["ctrl"], anyModifiers("shift+o", "threadPanel.openImages")),
    ]),
  })

  return () => {
    captured()
    unregisterFilter()
    unregisterPeek()
    unregisterMain()
    chords.dispose()
  }
}
