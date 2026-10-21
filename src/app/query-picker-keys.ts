/**
 * The layer every query picker shares (file, comments, marks, occurrence):
 * Esc closes, Enter picks, the arrows and Ctrl-p/Ctrl-n move, and the
 * query belongs to the picker's prompt field, which types every key left
 * unprevented (spec 065).
 */

import type { RiffKeymap } from "./keymap"
import { anyModifiers } from "./key-variants"

export interface QueryPickerKeyExtra {
  /** A key in binding syntax, such as `ctrl+x`. */
  key: string
  /** The command's name within the picker, such as `delete`. */
  name: string
  title: string
  run: () => void
}

export interface QueryPickerKeys {
  /** The command prefix, such as `filePicker`. */
  name: string
  category: string
  active: () => boolean
  close: () => void
  /** Returns nothing even on an empty list: a `false` would leave Enter unprevented. */
  pick: () => void
  move: (delta: number) => void
  extra?: readonly QueryPickerKeyExtra[]
}

export function registerQueryPickerKeys(riffKeymap: RiffKeymap, picker: QueryPickerKeys): () => void {
  const { name, category } = picker
  const command = (suffix: string, title: string, run: () => void) => ({
    name: `${name}.${suffix}`,
    title,
    category,
    palette: false,
    // Wrapped so no return value gets through: the keymap reads a `false`
    // as unhandled, and the chain these replaced prevented every key it acted on.
    run: () => {
      run()
    },
  })
  const extra = picker.extra ?? []

  const unregisterLayer = riffKeymap.keymap.registerLayer({
    enabled: picker.active,
    commands: [
      command("close", "Close the picker", picker.close),
      command("pick", "Go to the selected row", picker.pick),
      command("up", "Select the previous row", () => picker.move(-1)),
      command("down", "Select the next row", () => picker.move(1)),
      ...extra.map((entry) => command(entry.name, entry.title, entry.run)),
    ],
    bindings: [
      ...anyModifiers("escape", `${name}.close`),
      ...anyModifiers("return", `${name}.pick`),
      // The parser calls the key "return", but the keymap matches an event
      // named "enter" as a different key, and the chain took both.
      ...anyModifiers("enter", `${name}.pick`),
      ...anyModifiers("up", `${name}.up`),
      ...anyModifiers("down", `${name}.down`),
      ...anyModifiers("ctrl+p", `${name}.up`),
      ...anyModifiers("ctrl+n", `${name}.down`),
      ...extra.flatMap((entry) => anyModifiers(entry.key, `${name}.${entry.name}`)),
    ],
  })
  // No `rest` and no preventDefault: an unbound key, a bare p or n
  // included, is a letter of the query for the prompt field to type.
  const unregisterCapture = riffKeymap.capture(picker.active)
  return () => {
    unregisterCapture()
    unregisterLayer()
  }
}
