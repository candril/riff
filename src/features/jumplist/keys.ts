type Key = { name?: string; ctrl?: boolean; shift?: boolean; sequence?: string }

/** Cursor moves that are not jumps: stepping and scrolling inside a file. */
const STEP_KEYS = new Set([
  "j", "k", "h", "l", "w", "b", "e", "0", "^", "$",
  "up", "down", "left", "right",
])

/** Held with Ctrl, these scroll rather than jump. */
const STEP_CTRL_KEYS = new Set(["d", "u", "e", "y"])

/**
 * True for a key that moves the cursor without moving the reader — vim's own
 * line between a motion and a jump (spec 089).
 */
export function isStepMotion(key: Key): boolean {
  const name = key.name ?? ""
  if (key.ctrl) return STEP_CTRL_KEYS.has(name)
  return STEP_KEYS.has(name)
}

/**
 * `Ctrl-o`, `Ctrl-i`, and `tab`, which is how a terminal sends `Ctrl-i`.
 * Walking the list never extends it, wherever it lands.
 */
export function isListWalk(key: Key): boolean {
  const name = key.name ?? ""
  if (key.ctrl) return name === "o" || name === "i"
  return name === "tab"
}

/** `f`, `F`, `t`, `T`, `;` and `,` stay on their line, and vim does not record them. */
export function isFindMotion(key: Key): boolean {
  if (key.ctrl) return false
  const name = key.name ?? ""
  if (["f", "F", "t", "T", ";", ","].includes(name)) return true
  return key.sequence === ";" || key.sequence === ","
}

/** vim's `z` commands fold and scroll; none of them is a jump. */
export function isZOpener(key: Key): boolean {
  return key.name === "z" && !key.ctrl && !key.shift
}
