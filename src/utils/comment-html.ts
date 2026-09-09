/**
 * Turn the HTML people write in GitHub markdown into markdown the terminal
 * renderer understands.
 *
 * OpenTUI's markdown renderer has no case for HTML tokens: `<br>`, `<b>`,
 * `<details>` and the rest land in the panel verbatim, tags and all. GitHub
 * comments are full of them — `<br>` is the only way to get a line break
 * inside a table cell, and `<details>` is how half of all PR descriptions
 * hide their generated output.
 *
 * Only the handful of tags that carry meaning are translated, and only
 * outside code, where the tag is the text the author meant to write.
 * Anything else is left alone rather than guessed at.
 */

import { fencedRanges } from "./comment-images"

/** Inside a table row a break cannot be a newline — that would end the row. */
const CELL_BREAK = " · "

type Replacer = (source: string) => string

const REPLACERS: Replacer[] = [
  // <a href="…">text</a> — the link markdown would have been written as.
  (text) =>
    text.replace(
      /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi,
      (_match, dq, sq, bare, label) => {
        const url = dq ?? sq ?? bare ?? ""
        const inner = String(label).trim()
        return inner ? `[${inner}](${url})` : url
      }
    ),
  // <summary> is the label of a fold; the fold itself cannot be collapsed
  // in a terminal, so the body simply follows it.
  (text) =>
    text.replace(/<summary\b[^>]*>([\s\S]*?)<\/summary>/gi, (_match, label) => {
      const inner = String(label).trim()
      return inner ? `**${inner}**\n` : ""
    }),
  (text) => text.replace(/<\/?details\b[^>]*>/gi, ""),
  (text) => text.replace(/<(b|strong)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _tag, inner) => `**${inner}**`),
  (text) => text.replace(/<(i|em)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _tag, inner) => `*${inner}*`),
  (text) => text.replace(/<(code|kbd|samp)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _tag, inner) => `\`${inner}\``),
]

/**
 * Rewrite the HTML in a comment body for display. Returns the body
 * unchanged when it holds no HTML worth translating.
 */
export function softenCommentHtml(body: string): string {
  if (!body.includes("<")) return body

  const skip = codeRanges(body)
  return mapOutsideCode(body, skip, (segment, offset) =>
    REPLACERS.reduce((text, replace) => replace(text), breaks(segment, body, offset))
  )
}

/**
 * `<br>` becomes a real line break, except inside a table row, where a
 * newline would end the row and leave the rest of the cells stranded.
 */
function breaks(segment: string, source: string, offset: number): string {
  return segment.replace(/<br\s*\/?>/gi, (_match, index: number) =>
    inTableRow(source, offset + index) ? CELL_BREAK : "\n"
  )
}

function inTableRow(source: string, index: number): boolean {
  const start = source.lastIndexOf("\n", index - 1) + 1
  return source.slice(start, index).trimStart().startsWith("|")
}

/**
 * Apply a transform to everything outside code, keeping the code spans and
 * fences byte-for-byte.
 */
function mapOutsideCode(
  source: string,
  skip: ReadonlyArray<[number, number]>,
  transform: (segment: string, offset: number) => string
): string {
  let out = ""
  let cursor = 0
  for (const [start, end] of skip) {
    if (start < cursor) continue
    out += transform(source.slice(cursor, start), cursor)
    out += source.slice(start, end)
    cursor = end
  }
  return out + transform(source.slice(cursor), cursor)
}

/** Fenced blocks plus inline spans, sorted and non-overlapping. */
function codeRanges(source: string): Array<[number, number]> {
  const fenced = fencedRanges(source)
  const inline: Array<[number, number]> = []

  const spans = source.matchAll(/(`+)(?:[^`]|(?!\1)`)*\1/g)
  for (const span of spans) {
    const start = span.index
    if (fenced.some(([from, to]) => start >= from && start < to)) continue
    inline.push([start, start + span[0].length])
  }

  return [...fenced, ...inline].sort((a, b) => a[0] - b[0])
}
