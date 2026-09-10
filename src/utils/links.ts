/**
 * The link under the cursor (spec 057).
 *
 * A diff is full of paths worth following — a markdown link to an ADR, a
 * `see src/foo.ts:42` in a comment, a URL. This finds the one the cursor is
 * standing on; resolving it against the repo is the caller's job.
 */

export interface CursorLink {
  kind: "url" | "path"
  /** The target as written, with any line suffix already stripped off. */
  target: string
  /** Line number from a `#L42` or `:42` suffix. */
  line?: number
}

/** `[label](target)`, with an optional `"title"` after the target. */
const MARKDOWN_LINK = /\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g
const BARE_URL = /https?:\/\/[^\s)>\]"'`]+/g
/** What can sit either side of a bare path without being part of it. */
const PATH_DELIMITERS = /[\s()<>[\]{}"'`,;|]/
/** Trailing characters that end a sentence rather than a path. */
const TRAILING_NOISE = /[.,;:!?]+$/

export function linkAt(text: string, col: number): CursorLink | null {
  const inMarkdown = spanAt(text, col, MARKDOWN_LINK, 1)
  if (inMarkdown) return classify(inMarkdown)

  const inUrl = spanAt(text, col, BARE_URL, 0)
  if (inUrl) return classify(inUrl)

  const word = wordAt(text, col)
  if (!word) return null

  const link = classify(word)
  // A bare word is only a path if it reads like one; prose would otherwise
  // send `gf` looking for a file called "the".
  if (link?.kind === "path" && !looksLikePath(link.target)) return null
  return link
}

/**
 * The capture group of whichever match covers `col`. The whole match counts
 * as the target's territory, so the cursor can sit on a link's label rather
 * than having to find the parentheses.
 */
function spanAt(text: string, col: number, pattern: RegExp, group: number): string | null {
  pattern.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    const start = match.index
    const end = start + match[0].length
    if (col >= start && col < end) return match[group] ?? null
    if (match[0].length === 0) pattern.lastIndex++
  }
  return null
}

function wordAt(text: string, col: number): string | null {
  if (col < 0 || col >= text.length) return null
  if (PATH_DELIMITERS.test(text[col]!)) return null

  let start = col
  while (start > 0 && !PATH_DELIMITERS.test(text[start - 1]!)) start--
  let end = col
  while (end < text.length - 1 && !PATH_DELIMITERS.test(text[end + 1]!)) end++

  return text.slice(start, end + 1)
}

function classify(raw: string): CursorLink | null {
  const trimmed = raw.replace(TRAILING_NOISE, "")
  if (!trimmed) return null

  if (/^https?:\/\//i.test(trimmed)) {
    return { kind: "url", target: trimmed }
  }

  const suffix = trimmed.match(/(?:#L(\d+)|:(\d+))$/)
  const line = suffix ? Number(suffix[1] ?? suffix[2]) : undefined
  const withoutLine = suffix ? trimmed.slice(0, suffix.index) : trimmed
  // A `#section` anchor names a place inside the file, not a file.
  const target = withoutLine.replace(/#.*$/, "")
  if (!target) return null

  return line === undefined ? { kind: "path", target } : { kind: "path", target, line }
}

function looksLikePath(target: string): boolean {
  return target.includes("/") || /\.[A-Za-z0-9]{1,8}$/.test(target)
}

/**
 * The repo-root-relative paths a link could mean, best guess first.
 *
 * Two conventions collide in a diff. A markdown link is relative to the file
 * it is written in, which is why `../decisions/…` in `docs/guides/x.md`
 * resolves under `docs/`. A path dropped into prose — `see src/app.ts` — is
 * almost always from the repo root instead. Rather than guess from the
 * syntax, both readings are offered and the one that exists wins.
 *
 * A leading `/` means the repo root, not the filesystem's.
 */
export function resolveCandidates(target: string, sourceFile: string): string[] {
  if (target.startsWith("/")) return [normalize(target.slice(1))]

  const dir = sourceFile.includes("/") ? sourceFile.slice(0, sourceFile.lastIndexOf("/")) : ""
  const relative = normalize(dir ? `${dir}/${target}` : target)
  if (target.startsWith("./") || target.startsWith("../")) return [relative]

  const fromRoot = normalize(target)
  return relative === fromRoot ? [relative] : [relative, fromRoot]
}

function normalize(path: string): string {
  const parts: string[] = []
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue
    if (part === "..") parts.pop()
    else parts.push(part)
  }
  return parts.join("/")
}
