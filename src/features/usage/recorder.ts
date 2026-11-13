import type { KeyEvent, Renderable } from "@opentui/core"
import type { Keymap } from "@opentui/keymap"
import { addDelta, bump, emptyDelta, isEmptyDelta, keyedName, PER_KEY_COMMANDS, spellKey, type UsageCounts } from "./counts"

export interface UsageStore {
  load: () => UsageCounts | null
  save: (counts: UsageCounts) => void
  now?: () => Date
}

export interface UsageRecorder {
  command: (name: string, key?: KeyEvent | null) => void
  pick: (actionId: string) => void
  /** Adds what was counted since the last flush to the file, re-read first so two riffs running at once both count. */
  flush: () => void
}

export function createUsageRecorder(store: UsageStore): UsageRecorder {
  let delta = emptyDelta()
  return {
    command(name, key) {
      bump(delta.keys, PER_KEY_COMMANDS.has(name) && key ? keyedName(name, spellKey(key)) : name)
    },
    pick(actionId) {
      bump(delta.palette, actionId)
    },
    flush() {
      if (isEmptyDelta(delta)) return
      const pending = delta
      delta = emptyDelta()
      try {
        store.save(addDelta(store.load(), pending, store.now?.() ?? new Date()))
      } catch {
        // A count that cannot be saved is not worth interrupting a review over.
      }
    },
  }
}

/**
 * Counts every binding the keymap runs. Commands the palette runs through
 * `runCommand` emit no dispatch, so a palette pick is never also counted as
 * its key.
 */
export function recordKeymapUsage(keymap: Keymap<Renderable, KeyEvent>, recorder: UsageRecorder): () => void {
  let current: KeyEvent | null = null
  const stopKey = keymap.intercept("key", (ctx) => {
    current = ctx.event
  })
  const stopDispatch = keymap.on("dispatch", (event) => {
    if (event.phase !== "binding-execute" || typeof event.command !== "string") return
    recorder.command(event.command, current)
  })
  return () => {
    stopKey()
    stopDispatch()
  }
}
