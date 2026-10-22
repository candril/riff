import { KeyEvent, parseKeypress } from "@opentui/core"

/**
 * The keypresses a palette spelling stands for ("]f", "zR", "Ctrl+o", "/"),
 * parsed from the bytes a terminal sends for them, so each arrives as the
 * typed key would: `R` shifted, Ctrl+h as backspace and Ctrl+i as tab. The
 * keymap's own parseKeySequence folds the case away, which would turn `zR`
 * into `zr`. Null for a hint that names no keystrokes, such as
 * "y (comments panel)" or "Esc".
 */
export function spelledStrokes(keys: string): KeyEvent[] | null {
  const ctrl = /^Ctrl\+([a-z])$/.exec(keys)
  const raw = ctrl ? [String.fromCharCode(ctrl[1]!.charCodeAt(0) & 0x1f)] : /^\S{1,2}$/.test(keys) ? [...keys] : null
  if (!raw) return null
  const events: KeyEvent[] = []
  for (const stroke of raw) {
    const parsed = parseKeypress(stroke)
    if (!parsed) return null
    events.push(new KeyEvent(parsed))
  }
  return events
}
