import type { KeyEvent, Renderable } from "@opentui/core"
import type { Keymap } from "@opentui/keymap"
import type { JumpRecording } from "./jump-recording"
import { spelledStrokes } from "./spelled-keys"

/**
 * How the palette runs an action no case of its own handles: the command
 * its key runs, on the last keypress of the hint it shows. Commands read
 * that key as they read a typed one, so Ctrl-o's command, which declines a
 * key without ctrl, takes it. The interaction Ctrl-p opened is judged as
 * the hint's first key opens one, so the jumplist records what the key
 * would. A layer's `enabled` is not asked, as runCommand never asks it:
 * the action's own `available` is what gates the entry. False when the
 * hint spells no keypress or the command declines it.
 */
export function paletteCommandRunner(
  keymap: Keymap<Renderable, KeyEvent>,
  recording: Pick<JumpRecording, "retake"> | null,
): (name: string, keys: string) => boolean {
  return (name, keys) => {
    const strokes = spelledStrokes(keys)
    if (!strokes) return false
    recording?.retake(strokes[0]!)
    return keymap.runCommand(name, { event: strokes[strokes.length - 1]! }).ok
  }
}
