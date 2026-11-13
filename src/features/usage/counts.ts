/**
 * How often each keymap command ran on a key, and each palette action was
 * picked, summed across every riff since `since` (spec 117). Only names and
 * counts: never which file, which review, or in what order.
 */
export interface UsageCounts {
  since: string
  keys: Record<string, number>
  palette: Record<string, number>
}

export interface UsageDelta {
  keys: Map<string, number>
  palette: Map<string, number>
}

/**
 * Commands bound to more than one key that do something different on each:
 * the diff's and the tree's catch-alls, and `i`/`a`/`d`. The command's name
 * says nothing about which, so their counts are kept per key.
 */
export const PER_KEY_COMMANDS: ReadonlySet<string> = new Set(["diff.key", "tree.key", "global.surface"])

export function emptyDelta(): UsageDelta {
  return { keys: new Map(), palette: new Map() }
}

export function isEmptyDelta(delta: UsageDelta): boolean {
  return delta.keys.size === 0 && delta.palette.size === 0
}

export function bump(counts: Map<string, number>, name: string): void {
  counts.set(name, (counts.get(name) ?? 0) + 1)
}

export function addDelta(base: UsageCounts | null, delta: UsageDelta, now: Date): UsageCounts {
  const keys = { ...(base?.keys ?? {}) }
  const palette = { ...(base?.palette ?? {}) }
  for (const [name, n] of delta.keys) keys[name] = (keys[name] ?? 0) + n
  for (const [id, n] of delta.palette) palette[id] = (palette[id] ?? 0) + n
  return { since: base?.since ?? now.toISOString(), keys, palette }
}

/** A file that is not a UsageCounts reads as none, so a damaged one starts over rather than stopping riff. */
export function parseCounts(raw: unknown): UsageCounts | null {
  if (!raw || typeof raw !== "object") return null
  const { since, keys, palette } = raw as Record<string, unknown>
  if (typeof since !== "string") return null
  return { since, keys: numbers(keys), palette: numbers(palette) }
}

function numbers(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {}
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter((entry): entry is [string, number] => typeof entry[1] === "number"),
  )
}

export interface SpelledKey {
  name: string
  sequence?: string
  ctrl?: boolean
  meta?: boolean
}

const NAMED: Record<string, string> = { return: "Enter", enter: "Enter", escape: "Esc", tab: "Tab", space: "Space", backspace: "Backspace" }

/**
 * A key the way the registry's `shortcut` spells it ("/", "V", "Enter",
 * "Ctrl+d"), so a diff key's count lines up with the palette entry naming it.
 */
export function spellKey(key: SpelledKey): string {
  const named = NAMED[key.name]
  const base = named ?? (key.sequence && key.sequence.length === 1 && key.sequence >= " " ? key.sequence : key.name)
  if (key.ctrl) return `Ctrl+${key.name}`
  if (key.meta) return `Alt+${base}`
  return base
}

export function keyedName(command: string, spelled: string): string {
  return `${command} ${spelled}`
}
