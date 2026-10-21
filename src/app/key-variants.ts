const MODIFIERS = ["ctrl", "shift", "meta"] as const

/**
 * `key` with every combination of the modifiers it does not already name,
 * all bound to `cmd`. The keymap matches modifiers exactly, while the
 * priority chain these layers replaced matched the key name alone, so a
 * layer that must answer whatever is held lists the variants itself. The
 * binding parser reads alt and option as meta, which is also what the
 * terminal parser sets for them.
 */
export function anyModifiers(key: string, cmd: string): { key: string; cmd: string }[] {
  const parts = key.split("+")
  const name = parts.pop()!
  const free = MODIFIERS.filter((modifier) => !parts.includes(modifier))
  return Array.from({ length: 1 << free.length }, (_, mask) => {
    const held = free.filter((_, bit) => mask & (1 << bit))
    return { key: [...parts, ...held, name].join("+"), cmd }
  })
}
