import { getTreeSitterClient, type SimpleHighlight } from "@opentui/core"
import { getFiletypeFromPath } from "./filetype"
import { worthHighlighting } from "./file-highlights"
import { injectedHighlights } from "./injections"
import { applyQueryPredicates } from "./query-predicates"

/** A file's text on one side of the change, and what tree-sitter made of it. */
export interface SideParse {
  readonly content: string
  readonly highlights: SimpleHighlight[] | null
}

export interface FileParse {
  new?: SideParse
  old?: SideParse
}

/** The two versions of a file riff reads together (spec 080). */
export interface FileVersions {
  new: string
  old: string | null
}

/** How many files' parses are kept at once (spec 080). */
export const FILE_HIGHLIGHT_LIMIT = 24

export type Parse = (text: string, filetype: string) => Promise<SimpleHighlight[] | null>

/** One parse, read the way the queries behind it were written. */
export async function parseHighlights(text: string, filetype: string): Promise<SimpleHighlight[] | null> {
  const parsed = await getTreeSitterClient().highlightOnce(text, filetype)
  return parsed.highlights ? applyQueryPredicates(text, filetype, parsed.highlights) : null
}

/**
 * Each file's text and what tree-sitter made of it, per side (spec 080).
 * The old version answers for deletion rows, which no longer exist in
 * the file the new one parses.
 */
export class FileParses {
  private parses = new Map<string, FileParse>()
  private disposed = false
  /** Told when a parse lands, so the frame can be drawn again. */
  onParsed: ((filename: string) => void) | undefined

  constructor(private readonly parse: Parse = parseHighlights) {}

  get(filename: string): FileParse | undefined {
    return this.parses.get(filename)
  }

  /**
   * The files' own text, for highlighting them as files rather than as the
   * fragments on screen (spec 080). Parsing is asynchronous; until it lands
   * the rows keep the colours they have.
   */
  set(contents: ReadonlyMap<string, FileVersions>): void {
    for (const [filename, versions] of contents) {
      const parsed = this.parses.get(filename)
      if (parsed && parsed.new?.content === versions.new) continue
      // A file too big to be worth parsing is also too big to hold on to.
      if (!worthHighlighting(versions.new)) {
        this.parses.delete(filename)
        continue
      }

      const entry: FileParse = { new: { content: versions.new, highlights: null } }
      if (versions.old !== null && worthHighlighting(versions.old)) {
        entry.old = { content: versions.old, highlights: null }
      }
      this.parses.set(filename, entry)
      void this.parseFile(filename, "new", versions.new)
      if (entry.old) void this.parseFile(filename, "old", versions.old!)
    }

    // A file riff no longer has the text of has no parse to keep either:
    // switching the commit in scope drops them all, and a parse left behind
    // would colour the next span's rows from the last one's file.
    for (const filename of this.parses.keys()) {
      if (!contents.has(filename)) this.parses.delete(filename)
    }

    // A file's text and its parse are held for as long as the reader is
    // plausibly still in that part of the review; a two-hundred-file PR
    // should not end up holding two hundred of them.
    while (this.parses.size > FILE_HIGHLIGHT_LIMIT) {
      const oldest = this.parses.keys().next().value
      if (oldest === undefined) break
      this.parses.delete(oldest)
    }
  }

  /** A parse landing once the renderer is gone would draw into freed native memory. */
  dispose(): void {
    this.disposed = true
  }

  private async parseFile(filename: string, side: "new" | "old", content: string): Promise<void> {
    const filetype = getFiletypeFromPath(filename)
    if (!filetype) return

    try {
      const own = await this.parse(content, filetype)
      if (!own) return

      // After the file's own, so a GraphQL document's colours land on top of
      // the string its host reads the template literal as.
      const embedded = await injectedHighlights(content, filetype, this.parse)

      if (this.disposed) return
      const entry = this.parses.get(filename)
      // A refresh may have replaced the content while the parse was out.
      if (!entry || entry[side]?.content !== content) return
      entry[side] = { content, highlights: [...own, ...embedded] }
      this.onParsed?.(filename)
    } catch {
      // No parser for this filetype, or the worker is unhappy: the rows
      // keep the colours the fragment parse gave them.
    }
  }
}
