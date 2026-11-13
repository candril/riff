import type { CliRenderer, KeyEvent, Renderable } from "@opentui/core"
import type { Keymap } from "@opentui/keymap"
import type { ActionMenuState } from "../action-menu/state"
import { loadUsage, saveUsage } from "../../storage/usage"
import { createUsageRecorder, recordKeymapUsage } from "./recorder"

/** Often enough that a crash or a kill -9 loses little, rarely enough that j held down never writes. */
const FLUSH_INTERVAL_MS = 30_000

/** The running app's usage counts (spec 117): every key command and palette pick, into ~/.riff/usage.json. */
export function startUsageRecording(
  renderer: Pick<CliRenderer, "on">,
  keymap: Keymap<Renderable, KeyEvent>,
  actionMenu: Pick<ActionMenuState, "onPick">,
): void {
  const recorder = createUsageRecorder({ load: () => loadUsage(), save: (counts) => saveUsage(counts) })
  recordKeymapUsage(keymap, recorder)
  actionMenu.onPick(recorder.pick)
  setInterval(recorder.flush, FLUSH_INTERVAL_MS).unref()
  // quit() ends in process.exit; Ctrl-c and the exit signals only destroy the renderer.
  process.on("exit", recorder.flush)
  renderer.on("destroy", recorder.flush)
}
