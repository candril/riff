/**
 * Read the files on screen, so their rows can be highlighted as files
 * rather than as the fragments they are (spec 080).
 *
 * Asked for per file as it comes into view, never for the diff at large:
 * a two-hundred-file review is not two hundred reads nobody wanted. Local
 * mode takes it off disk; a PR asks GitHub, the way expanding context
 * already does, and the same cache answers both.
 */

import type { AppMode } from "../../types"
import { MAX_HIGHLIGHT_BYTES } from "../../vim-diff/file-highlights"
import type { FetchFileVersions } from "./load"
import type { FileContentState } from "./state"

/**
 * How long the cursor stays in a file before riff reads it for the colours
 * (spec 080). Long enough that `]f]f]f` through a review reads nothing,
 * short enough that arriving somewhere and looking at it does.
 */
const HIGHLIGHT_SOURCE_DELAY_MS = 150

/**
 * How many files one pass reads. A screen of one-line files would
 * otherwise be a screen of fetches at once; the rest stay on screen, so
 * the render each finished read triggers comes back for them.
 */
export const HIGHLIGHT_SOURCE_BATCH = 6

export interface HighlightSourceDeps {
  fileContent: Pick<FileContentState, "entry" | "set" | "generation">
  fetchFileVersions: FetchFileVersions
  /** The files with rows in the diff view on screen. */
  visibleFilenames: () => Iterable<string>
  /** The commit span in scope, or null for the whole review. */
  scopeSpan: () => { oldest: string; newest: string } | null
  head: () => string | undefined
  target: string | undefined
  appMode: () => AppMode
  render: () => void
  delayMs?: number
  fileSize?: (filename: string) => number
}

export function createHighlightSourceReader(deps: HighlightSourceDeps) {
  const delayMs = deps.delayMs ?? HIGHLIGHT_SOURCE_DELAY_MS
  const fileSize = deps.fileSize ?? ((filename: string) => Bun.file(filename).size)

  let highlightSourceTimer: ReturnType<typeof setTimeout> | null = null
  let highlightSourceArmedFor = ""
  const highlightSourceFailed = new Set<string>()
  const highlightSourceInFlight = new Set<string>()
  const highlightSourcePending = new Map<string, string>()

  /**
   * What a read would fetch: the file, from the revisions in view. A refresh
   * or a change of commit drops what riff read, and this is how it knows to
   * read it again rather than leaving the rows to the fragment parse.
   */
  function highlightSourceKey(filename: string): string {
    const span = deps.scopeSpan()
    const from = span
      ? `${span.oldest}..${span.newest}`
      : deps.head() ?? deps.target ?? ""
    return `${filename}@${from}`
  }

  /**
   * The key a read of this file would carry, or null if it needs no read.
   *
   * The ignore list is not consulted. It decides what the tree offers, not
   * what the diff draws — `**​/__snapshots__/**` is ignored by default, and
   * a snapshot is exactly the generated file a reader does open, to see the
   * one line that moved. Being on screen is the whole test: what riff shows
   * a reader, riff colours from the file (spec 080).
   */
  function highlightSourceNeeded(filename: string): string | null {
    const cached = deps.fileContent.entry(filename)
    if (cached?.newContent || cached?.loading || cached?.error) return null

    const key = highlightSourceKey(filename)
    if (highlightSourceInFlight.has(key) || highlightSourceFailed.has(key)) return null

    // Locally the size is one stat away, so the read never happens at all.
    // A PR's is not known until it arrives, and the parse declines it then.
    if (deps.appMode() === "local" && fileSize(filename) > MAX_HIGHLIGHT_BYTES) return null

    return key
  }

  /**
   * A read that lands after the diff changed is dropped whole, failure
   * included: the next diff asks for the file again, with nothing in the
   * way.
   */
  async function readHighlightSource(filename: string, key: string): Promise<void> {
    const generation = deps.fileContent.generation()
    try {
      const fetched = await deps.fetchFileVersions(filename)
      if (deps.fileContent.generation() !== generation) return
      if (fetched.ok) {
        deps.fileContent.set(filename, fetched.newContent, fetched.oldContent)
        deps.render()
      } else {
        highlightSourceFailed.add(key)
      }
    } catch {
      if (deps.fileContent.generation() !== generation) return
      highlightSourceFailed.add(key)
    } finally {
      highlightSourceInFlight.delete(key)
    }
  }

  return {
    /**
     * Read every file with code on screen, not only the one the cursor is in
     * (spec 080). A file the reader can see is coloured from the file or from
     * the fragment, and the fragment is wrong in ways the file is not — a
     * hunk starting inside a comment, or a schema whose `on` turns up as a
     * keyword in the middle of a word.
     *
     * Bounded by the viewport rather than by the review: what is on screen is
     * a handful of files, where the diff at large is two hundred reads nobody
     * asked for.
     */
    request(): void {
      highlightSourcePending.clear()
      for (const filename of deps.visibleFilenames()) {
        const key = highlightSourceNeeded(filename)
        if (key) highlightSourcePending.set(filename, key)
      }
      if (highlightSourcePending.size === 0) return

      // Re-armed only when the set of wanted files changes, which is what
      // makes walking a review with `]f` read nothing: each move rearms, and
      // the read lands once the reader has stopped somewhere. An unchanged
      // set leaves the pending timer alone, so a render on its own timer —
      // the comment poll — cannot starve it.
      const armFor = [...highlightSourcePending.values()].sort().join("|")
      if (highlightSourceTimer && armFor === highlightSourceArmedFor) return
      highlightSourceArmedFor = armFor
      if (highlightSourceTimer) clearTimeout(highlightSourceTimer)

      // Quietly: none of these may put the panel into a loading state the
      // reader would have to watch.
      highlightSourceTimer = setTimeout(() => {
        highlightSourceTimer = null
        highlightSourceArmedFor = ""
        const wanted = [...highlightSourcePending].slice(0, HIGHLIGHT_SOURCE_BATCH)
        highlightSourcePending.clear()

        for (const [filename, key] of wanted) {
          // The state may have moved while the pause ran.
          if (highlightSourceNeeded(filename) !== key) continue
          highlightSourceInFlight.add(key)
          void readHighlightSource(filename, key)
        }
      }, delayMs)
    },
    dispose(): void {
      if (highlightSourceTimer) clearTimeout(highlightSourceTimer)
      highlightSourceTimer = null
    },
  }
}
