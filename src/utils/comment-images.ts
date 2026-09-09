/**
 * Pull image references out of a comment body.
 *
 * GitHub's web UI pastes screenshots as raw `<img>` HTML, and OpenTUI's
 * markdown renderer has no case for HTML tokens — the tag lands in the panel
 * verbatim, a wall of attributes wrapped around a URL. Drawing the picture
 * instead is not on the table: kitty graphics don't survive tmux, OpenTUI has
 * no image renderable, and `github.com/user-attachments/...` is authenticated
 * by browser session, so on a private repo riff can't even fetch the bytes
 * with its gh token. What's left is to strip the reference down to its alt
 * text and hand the URL to the browser on demand, where the session exists.
 */

export interface CommentImage {
  /** What the panel shows in place of the picture. */
  label: string
  url: string
}

export interface CommentBodyImages {
  /** The body with every image reference lifted out. May be empty. */
  text: string
  images: CommentImage[]
}

/** `<a href="…"><img …></a>` — GitHub wraps pasted images in a link to the
 *  full-size asset. Matched ahead of the bare tag so the anchor goes too. */
const ANCHORED_IMG = /<a\b[^>]*>\s*<img\b[^>]*?\/?>\s*<\/a>/gi
const IMG_TAG = /<img\b[^>]*?\/?>/gi
const MD_IMAGE = /!\[([^\]]*)\]\(\s*<?([^\s)>]+)>?[^)]*\)/g

interface Hit {
  start: number
  end: number
  image: CommentImage | null
}

export function extractCommentImages(body: string): CommentBodyImages {
  const source = body.replace(/\r\n/g, "\n")
  const skip = fencedRanges(source)
  const outsideCode = (start: number) => !skip.some(([s, e]) => start >= s && start < e)

  const hits: Hit[] = []
  for (const m of source.matchAll(ANCHORED_IMG)) {
    if (outsideCode(m.index)) {
      hits.push({ start: m.index, end: m.index + m[0].length, image: fromTag(m[0]) })
    }
  }
  for (const m of source.matchAll(IMG_TAG)) {
    if (outsideCode(m.index)) {
      hits.push({ start: m.index, end: m.index + m[0].length, image: fromTag(m[0]) })
    }
  }
  for (const m of source.matchAll(MD_IMAGE)) {
    if (outsideCode(m.index)) {
      hits.push({
        start: m.index,
        end: m.index + m[0].length,
        image: { label: label(m[1] ?? "", m[2] ?? ""), url: m[2] ?? "" },
      })
    }
  }

  hits.sort((a, b) => a.start - b.start)

  const images: CommentImage[] = []
  let text = ""
  let cursor = 0
  for (const hit of hits) {
    // An anchored image also matches IMG_TAG; the anchor sorts first and
    // swallows the inner tag's range.
    if (hit.start < cursor) continue
    text += source.slice(cursor, hit.start)
    cursor = hit.end
    if (hit.image) images.push(hit.image)
  }
  text += source.slice(cursor)

  return { text: tidy(text), images }
}

function fromTag(tag: string): CommentImage | null {
  const url = attribute(tag, "src")
  if (!url) return null
  return { label: label(attribute(tag, "alt") ?? "", url), url }
}

function attribute(tag: string, name: string): string | null {
  const match = tag.match(
    new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i")
  )
  if (!match) return null
  return match[1] ?? match[2] ?? match[3] ?? null
}

/**
 * Alt text if the author wrote any, else the asset's file name. GitHub's own
 * attachment URLs end in a bare UUID, which tells the reader nothing, so those
 * fall through to a generic label.
 */
function label(alt: string, url: string): string {
  const trimmed = alt.trim()
  if (trimmed) return trimmed
  const name = url.split(/[?#]/)[0]?.split("/").pop() ?? ""
  return /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(name) ? name : "image"
}

/**
 * Lifting an image out of its own paragraph leaves a hole; close it so the
 * remaining prose doesn't render with a gap where the picture used to be.
 */
function tidy(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** Character ranges covered by fenced code blocks — an `<img>` shown as an
 *  example there is the text the author meant to write, not an attachment. */
export function fencedRanges(source: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  let offset = 0
  let openedAt: number | null = null
  let fence = ""
  for (const line of source.split("\n")) {
    const marker = line.match(/^\s*(`{3,}|~{3,})/)?.[1]
    if (openedAt === null) {
      if (marker) {
        openedAt = offset
        fence = marker[0]!
      }
    } else if (marker && marker[0] === fence) {
      ranges.push([openedAt, offset + line.length])
      openedAt = null
    }
    offset += line.length + 1
  }
  if (openedAt !== null) ranges.push([openedAt, source.length])
  return ranges
}
