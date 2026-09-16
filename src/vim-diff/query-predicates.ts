/**
 * The captures a highlight query guards with a predicate, which the parser
 * applies anyway.
 *
 * OpenTUI evaluates none of them. The CSS queries call a property name a
 * `variable` only when it is a custom property —
 * `((property_name) @variable (#lua-match? @variable "^[-][-]"))` — so
 * without the predicate every `display:` and `gap:` is painted as a plain
 * name instead of a property, the later capture winning over `@property`.
 */

import type { SimpleHighlight } from "@opentui/core"

/** What a CSS custom property is called: `--brand-colour`. */
const CUSTOM_PROPERTY = "--"

/**
 * The highlights of a parse, with the guarded captures riff can tell apart
 * dropped. A capture over text another already covers is the guarded
 * reading of it; one standing on its own — a keyframes name — is not.
 */
export function applyQueryPredicates(
  text: string,
  filetype: string,
  highlights: readonly SimpleHighlight[]
): SimpleHighlight[] {
  if (filetype !== "css") return [...highlights]

  const covered = new Map<string, number>()
  for (const [start, end] of highlights) {
    const span = `${start}:${end}`
    covered.set(span, (covered.get(span) ?? 0) + 1)
  }

  return highlights.filter(([start, end, group]) => {
    if (group !== "variable") return true
    if (text.slice(start, end).startsWith(CUSTOM_PROPERTY)) return true
    return (covered.get(`${start}:${end}`) ?? 0) < 2
  })
}
