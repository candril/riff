/**
 * The chat's keys (spec 102): Ctrl-r walks into and out of the chat from
 * every view, and while the chat has focus every key stops here, so nothing
 * typed into it reaches the diff, the tree or the threads.
 */

import type { KeyEvent, TextareaRenderable } from "@opentui/core"
import type { RiffKeymap } from "../../app/keymap"
import { anyModifiers, without } from "../../app/key-variants"
import { composerOpen } from "../../app/diff-focus"
import { focusLeft, focusRight, promptOpen, toggleChat, type AppState } from "../../state"
import type { VimCursorState } from "../../vim-diff/types"
import type { SearchState } from "../../vim-diff/search-state"
import { isVisualMode } from "../../vim-diff/cursor-state"
import { registerAtPickerLayer } from "../../app/at-picker-keys"
import { attachOnScreen } from "./attach"
import type { ChatAtPicker } from "./at-picker"
import type { ChatState } from "./state"

export interface ChatKeyDeps {
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
  getVimState: () => VimCursorState
  getSearchState: () => SearchState
  chat: { state: ChatState; input: () => TextareaRenderable | null; atPicker: ChatAtPicker }
}

const isNewConversation = (key: KeyEvent) => key.ctrl && key.name === "n"

/**
 * A composer or a one-line prompt keeps its keys, Ctrl-r included: the
 * chat taking focus from under it would strand what is being typed there.
 */
export function chatStandsAside(state: AppState, searchActive: boolean): boolean {
  return composerOpen(state) || promptOpen(state) || searchActive || state.prInfoPanel.commentInputOpen
}

/**
 * Whether the chat's reach takes `key` from outside the chat: Ctrl-r, and
 * Ctrl-l from the thread panel with the chat open. A modal the chat outranks
 * lets these through, since its capture would otherwise make the reach
 * stand aside.
 */
export function chatReaches(key: Pick<KeyEvent, "name" | "ctrl">, state: AppState, searchActive: boolean): boolean {
  if (!key.ctrl || chatStandsAside(state, searchActive)) return false
  if (key.name === "r") return true
  return key.name === "l" && state.focusedPanel === "comments" && state.chatOpen
}

export function registerChatKeys(riffKeymap: RiffKeymap, deps: ChatKeyDeps): () => void {
  const { chat } = deps
  const standsAside = () => chatStandsAside(deps.getState(), deps.getSearchState().active)
  const focused = () => {
    const state = deps.getState()
    return state.chatOpen && state.focusedPanel === "chat" && !standsAside()
  }
  // No preventDefault in the rest: the focused textarea types every key the
  // chat does not bind, and runs only after riff's key handler leaves it.
  const captured = riffKeymap.capture(focused, (key) => {
    if (!isNewConversation(key)) chat.state.cancelNewConversation()
  })
  const move = (to: (s: AppState) => AppState) => {
    deps.setState(to)
    deps.render()
  }
  // Ctrl-n confirms a pending "start over?"; the other keys the chat
  // types or acts on decline it.
  const command = (name: string, title: string, run: () => void, cancels = true) => ({
    name: `chat.${name}`,
    title,
    category: "Chat",
    palette: false,
    run: () => {
      if (cancels) chat.state.cancelNewConversation()
      run()
    },
  })
  const inputText = () => chat.input()?.plainText ?? ""

  const unregisterFocused = riffKeymap.keymap.registerLayer({
    enabled: () => captured.holds(),
    commands: [
      command("send", "Ask the agent", () => {
        // A question that did not go keeps its text, so a mistyped @path is fixed rather than retyped.
        if (chat.state.send(inputText())) {
          chat.input()?.clear()
          chat.atPicker.close()
        }
      }),
      command("newLine", "Break the line", () => chat.input()?.newLine()),
      command("escape", "Stop the answer, or back to the diff", () => {
        if (chat.state.status() === "answering") chat.state.interrupt()
        else move((s) => ({ ...s, focusedPanel: "diff" }))
      }),
      command(
        "newConversation",
        "Start a new conversation",
        () => {
          chat.state.newConversation()
          chat.atPicker.close()
        },
        false,
      ),
      // The chat is the last panel on the right, so Ctrl-l has nowhere to go;
      // a no-op is no answer to "start over?" either.
      command("right", "Stay in the chat", () => {}, false),
    ],
    bindings: [
      ...without(["shift", "meta"], anyModifiers("return", "chat.send")),
      // The parser calls the key "return", but the keymap matches an event
      // named "enter" as a different key, and Enter sends under either name.
      ...without(["shift", "meta"], anyModifiers("enter", "chat.send")),
      // Ctrl-j is a line feed on the wire; the kitty protocol reports it as itself.
      ...anyModifiers("linefeed", "chat.newLine"),
      ...anyModifiers("ctrl+j", "chat.newLine"),
      ...anyModifiers("escape", "chat.escape"),
      ...anyModifiers("ctrl+n", "chat.newConversation"),
      ...anyModifiers("ctrl+l", "chat.right"),
    ],
  })
  // Ctrl-h and backspace are one key on most terminals: it deletes while
  // there is text, and walks once there is none.
  const unregisterEmpty = riffKeymap.keymap.registerLayer({
    enabled: () => captured.holds() && inputText() === "",
    commands: [command("walkLeft", "Walk left out of the chat", () => move(focusLeft))],
    bindings: anyModifiers("backspace", "chat.walkLeft"),
  })
  // After the chat's own layers, so while the picker is up Esc closes it
  // rather than stopping an answer, and Ctrl-n moves rather than starting over.
  const unregisterAtPicker = registerAtPickerLayer(riffKeymap, {
    prefix: "chat.at",
    category: "Chat",
    holds: captured.holds,
    picker: chat.atPicker,
    onKey: () => chat.state.cancelNewConversation(),
  })
  // The keys that reach the chat from elsewhere, and Ctrl-r back out of it,
  // but never from under a modal that outranks the chat, which keeps the
  // keys it holds.
  const unregisterReach = riffKeymap.keymap.registerLayer({
    enabled: () => !standsAside() && (!riffKeymap.held() || captured.holds()),
    commands: [
      command(
        "toggle",
        "Open or close the chat",
        () => {
          const state = deps.getState()
          const fromDiff = state.focusedPanel === "diff" && state.viewMode === "diff"
          move(toggleChat)
          if (fromDiff) attachOnScreen(chat.input(), isVisualMode(deps.getVimState()))
        },
        false,
      ),
      {
        // The thread panel swallows the keys it does not know, so the step from it to the chat is taken here.
        ...command("fromThreads", "Step from the threads to the chat", () => move(focusRight), false),
        enabled: () => deps.getState().focusedPanel === "comments" && deps.getState().chatOpen,
      },
    ],
    bindings: [...anyModifiers("ctrl+r", "chat.toggle"), ...anyModifiers("ctrl+l", "chat.fromThreads")],
  })
  return () => {
    captured()
    unregisterFocused()
    unregisterEmpty()
    unregisterAtPicker()
    unregisterReach()
  }
}
