/**
 * Languages written inside another one: the GraphQL a `graphql` tagged
 * template holds, the CSS a `styled.div` one does.
 *
 * OpenTUI parses injections too, but it picks the language from the node's
 * type alone, which cannot tell those from any other template literal in
 * the file. So the regions are found here and parsed on their own, and
 * their highlights are moved to where the text sits in the file.
 */

import type { SimpleHighlight } from "@opentui/core"

/** A stretch of one file written in another language. */
export interface InjectedRegion {
  /** Offsets of the embedded text, excluding the backticks around it. */
  start: number
  end: number
  filetype: string
}

/** The tags that mark a template literal as another language. */
const TAGS: Record<string, string> = {
  graphql: "graphql",
  gql: "graphql",
  css: "css",
  keyframes: "css",
  createGlobalStyle: "css",
}

/**
 * `styled.div`, `styled(Button)` — the component builders of next-yak and
 * styled-components, which take their CSS the same way a `css` tag does.
 */
const STYLED = String.raw`styled(?:\.[A-Za-z][\w$]*|\([^()]*\))`

/** The filetypes whose template literals are worth looking through. */
const HOSTS = new Set(["typescript", "tsx", "javascript", "jsx"])

/**
 * A file holding more of these is not a file with embedded documents in it,
 * it is one the pattern has misread; the parse of each costs a round trip.
 * A component file of any size runs to a few dozen styled blocks.
 */
const MAX_REGIONS = 64

const TAGGED_TEMPLATE = new RegExp(
  String.raw`(?:^|[^\w$])(?:(${Object.keys(TAGS).join("|")})|${STYLED})\s*\``,
  "g"
)

/** Every embedded document in a file, in the order they appear. */
export function injectedRegions(content: string, filetype: string): InjectedRegion[] {
  if (!HOSTS.has(filetype)) return []

  const regions: InjectedRegion[] = []
  const opener = new RegExp(TAGGED_TEMPLATE.source, "g")
  let match: RegExpExecArray | null

  while ((match = opener.exec(content)) !== null && regions.length < MAX_REGIONS) {
    const start = match.index + match[0].length
    const end = closingBacktick(content, start)
    if (end === -1) break
    // Only a plain tag is captured; the `styled` forms are all CSS.
    if (end > start) regions.push({ start, end, filetype: match[1] ? TAGS[match[1]]! : "css" })
    opener.lastIndex = end + 1
  }

  return regions
}

/**
 * The file's embedded documents, highlighted, in the file's own offsets.
 *
 * The parse is handed in: this is the half worth reading on its own, and
 * the worker behind it is the caller's to reach.
 */
export async function injectedHighlights(
  content: string,
  filetype: string,
  parse: (text: string, filetype: string) => Promise<SimpleHighlight[] | null>
): Promise<SimpleHighlight[]> {
  const regions = injectedRegions(content, filetype)
  const parsed = await Promise.all(
    regions.map((region) => parse(content.slice(region.start, region.end), region.filetype))
  )

  const highlights: SimpleHighlight[] = []
  for (const [index, region] of regions.entries()) {
    const inner = parsed[index]
    if (!inner) continue

    // `${...}` is the host's language, not the embedded one, and reading
    // `${spacing[16]}` as CSS makes a tag name of a variable.
    const holes = interpolations(content.slice(region.start, region.end))
    for (const [start, end, group, meta] of inner) {
      if (holes.some(([from, to]) => start < to && end > from)) continue
      highlights.push([start + region.start, end + region.start, group, meta])
    }
  }

  return highlights
}

/** Where the host's expressions sit inside an embedded document. */
function interpolations(text: string): Array<readonly [number, number]> {
  const holes: Array<readonly [number, number]> = []

  for (let i = 0; i < text.length - 1; i++) {
    if (text[i] !== "$" || text[i + 1] !== "{") continue
    const end = closingBrace(text, i + 1)
    if (end === -1) break
    holes.push([i, end + 1] as const)
    i = end
  }

  return holes
}

function closingBrace(text: string, open: number): number {
  let depth = 0
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++
    else if (text[i] === "}" && --depth === 0) return i
  }
  return -1
}

/** Where the template ends, skipping the backticks it escapes. */
function closingBacktick(content: string, from: number): number {
  for (let i = from; i < content.length; i++) {
    if (content[i] === "\\") {
      i++
      continue
    }
    if (content[i] === "`") return i
  }
  return -1
}
