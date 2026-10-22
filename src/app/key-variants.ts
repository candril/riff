const MODIFIERS = ["ctrl", "shift", "meta", "super", "hyper"] as const
type Modifier = (typeof MODIFIERS)[number]

/**
 * `key` with every combination of the modifiers it does not already name,
 * all bound to `cmd`. The keymap compares all five modifiers it knows
 * exactly, so a layer that must answer whatever is held lists the
 * variants itself. Alt and option need no entry: the binding parser reads
 * them as meta, which is also what the terminal parser sets for them.
 */
export function anyModifiers(key: string, cmd: string): { key: string; cmd: string }[] {
  // The last "+" before the name separates it, so "+" and "ctrl++" name the plus key.
  const at = key.length > 1 ? key.lastIndexOf("+", key.length - 2) : -1
  const name = key.slice(at + 1)
  const parts = at < 0 ? [] : key.slice(0, at).split("+")
  const free = MODIFIERS.filter((modifier) => !parts.includes(modifier))
  return Array.from({ length: 1 << free.length }, (_, mask) => {
    const held = free.filter((_, bit) => mask & (1 << bit))
    return { key: [...parts, ...held, name].join("+"), cmd }
  })
}

/** The bindings that hold none of `modifiers`, to carve a key back out of anyModifiers. */
export function without(modifiers: Modifier[], bindings: { key: string; cmd: string }[]): { key: string; cmd: string }[] {
  return bindings.filter(({ key }) => !key.split("+").some((part) => modifiers.includes(part as Modifier)))
}
