import type { SimpleHighlight } from "@opentui/core"

/**
 * A markdown fence whose language riff can parse comes back as one
 * `markup.raw.block` over the whole block, with the language's own captures
 * inside it. Ranked by specificity, that three-part name outranks every
 * injected capture and paints the block green over them, so it goes, as
 * OpenTUI's own chunking drops it. The short captures on the fence markers
 * carry no `containsInjection` and keep the fences green; a fence in a
 * language riff cannot parse gets no injection and stays green throughout.
 */
export function withoutInjectionContainers(highlights: readonly SimpleHighlight[]): SimpleHighlight[] {
  return highlights.filter(
    ([, , capture, meta]) => !(capture === "markup.raw.block" && meta?.containsInjection && !meta.isInjection)
  )
}
