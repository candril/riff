import type { KeyEvent, Renderable } from "@opentui/core"
import type { Keymap } from "@opentui/keymap"

/**
 * Each registered command's `keys`, by command name, for the palette to
 * show beside the action the command runs. The keymap's own catalog, so a
 * hint cannot name a command no layer registers. Read once every layer has
 * registered: the layers never change after that.
 */
export function commandKeys(keymap: Keymap<Renderable, KeyEvent>): ReadonlyMap<string, string> {
  const keys = new Map<string, string>()
  for (const { command } of keymap.getCommandEntries({ visibility: "registered" })) {
    const spelled = command["keys"]
    if (typeof spelled === "string") keys.set(command.name, spelled)
  }
  return keys
}
