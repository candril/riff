/**
 * The search prompt's keys. The prompt holds every key while it is up, but
 * only Enter and Escape mean anything here: the pattern itself is typed
 * into the shared prompt field, which reports every change to
 * `SearchHandler.updatePattern` (specs 017, 065).
 */

import type { KeyEvent } from "@opentui/core"
import type { RiffKeymap } from "../../app/keymap"
import { anyModifiers } from "../../app/key-variants"
import type { SearchHandler } from "../../vim-diff/search-handler"
import type { SearchState } from "../../vim-diff/search-state"

export interface SearchKeyDeps {
  searchState: () => SearchState
  searchHandler: () => Pick<SearchHandler, "cancelSearch" | "confirmSearch">
}

export function registerSearchKeys(riffKeymap: RiffKeymap, deps: SearchKeyDeps): () => void {
  // No preventDefault in the rest: everything else is typing, and belongs
  // to the prompt field, Ctrl-w and the rest of the editing keys the widget
  // brings with it included (spec 065).
  const captured = riffKeymap.capture(() => deps.searchState().active)
  const command = (name: string, title: string, run: () => void) => ({
    name: `search.${name}`,
    title,
    category: "Search",
    palette: false as const,
    run: ({ event }: { event: KeyEvent }) => {
      event.preventDefault()
      run()
    },
  })
  const unregisterLayer = riffKeymap.keymap.registerLayer({
    enabled: () => captured.holds(),
    commands: [
      command("cancel", "Drop the search", () => deps.searchHandler().cancelSearch()),
      command("confirm", "Keep the search", () => deps.searchHandler().confirmSearch()),
    ],
    bindings: [
      ...anyModifiers("escape", "search.cancel"),
      ...anyModifiers("return", "search.confirm"),
      // The parser calls the key "return", but the keymap matches an event
      // named "enter" as a different key, though both name Enter.
      ...anyModifiers("enter", "search.confirm"),
    ],
  })
  return () => {
    captured()
    unregisterLayer()
  }
}
