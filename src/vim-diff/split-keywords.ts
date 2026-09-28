/**
 * Keywords a parser lexed out of the middle of a name.
 *
 * A grammar that declares no `word` token lets its lexer, while recovering
 * from an error, match a keyword wherever the letters happen to spell one.
 * GraphQL's does: fragments that open inside a `type` body do not parse, and
 * the `on` in `personalized`, `contract` or `Application` comes back as the
 * keyword. A real keyword never touches an identifier character on either
 * side, so one that does is part of a name.
 */

import type { SimpleHighlight } from "@opentui/core"

const WORD_CHAR = /[\p{L}\p{N}_]/u

export function dropSplitKeywords(
  highlights: readonly SimpleHighlight[],
  text: string
): SimpleHighlight[] {
  return highlights.filter(([start, end, group]) => {
    if (!group.startsWith("keyword")) return true
    const before = text[start - 1]
    const after = text[end]
    return !(before && WORD_CHAR.test(before)) && !(after && WORD_CHAR.test(after))
  })
}
