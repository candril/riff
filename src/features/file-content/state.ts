/**
 * The expanded context (spec 074): the whole files riff read to open a
 * collapsed run of context or to highlight a hunk, the runs opened for good,
 * and the one being fetched right now. It is what the reader chose to see
 * of the files around the diff, not review state, so the feature owns it
 * rather than AppState (spec 100, M6; ADR-003). A reload keeps the opened
 * runs but reads the files again, a commit switch drops both, and creating
 * a PR or opening the branch's PR drops all of it.
 */

import { createSignal } from "solid-js"

export interface FileContentCache {
  [filename: string]: {
    newContent: string | null  // After changes (HEAD or working copy)
    oldContent: string | null  // Before changes (parent revision)
    loading: boolean
    error?: string
  }
}

export type FileContentEntry = FileContentCache[string]

export type FileContentState = ReturnType<typeof createFileContentState>

export function createFileContentState() {
  const [contents, setContents] = createSignal<FileContentCache>({})
  const [expanded, setExpanded] = createSignal<ReadonlySet<string>>(new Set())
  // The one riff is fetching the file for right now: every other collapsed
  // run in that file is not loading, and should not say it is.
  const [expanding, setExpanding] = createSignal<string | null>(null)

  const put = (filename: string, entry: FileContentEntry) =>
    setContents((cache) => ({ ...cache, [filename]: entry }))

  return {
    contents,
    entry(filename: string): FileContentEntry | null {
      return contents()[filename] ?? null
    },
    markLoading(filename: string) {
      put(filename, { newContent: null, oldContent: null, loading: true })
    },
    set(filename: string, newContent: string | null, oldContent: string | null) {
      put(filename, { newContent, oldContent, loading: false })
    },
    setError(filename: string, error: string) {
      put(filename, { newContent: null, oldContent: null, loading: false, error })
    },

    expanded,
    isExpanded(dividerKey: string): boolean {
      return expanded().has(dividerKey)
    },
    /**
     * Open a collapsed run of context, for good.
     *
     * One-way on purpose: expanding is not folding. A fold hides something you
     * can already see; this fetches lines the diff never carried, and there is
     * nothing to gain from putting them back — `gr` or folding the file does.
     */
    expand(dividerKey: string) {
      if (expanded().has(dividerKey)) return
      setExpanded((open) => new Set(open).add(dividerKey))
    },
    expanding,
    setExpanding(dividerKey: string | null) {
      setExpanding(dividerKey)
    },

    /**
     * What riff read of a file belongs to the span it read it for: once a
     * commit comes into or leaves scope the rows on screen are a different
     * diff, between different ends. A fetch still in flight clears its own
     * spinner when it lands.
     */
    forgetSpan() {
      setContents({})
      setExpanded(new Set<string>())
    },
    clear() {
      setContents({})
      setExpanded(new Set<string>())
      setExpanding(null)
    },
    restoreExpanded(dividerKeys: ReadonlySet<string>) {
      setExpanded(new Set(dividerKeys))
    },
  }
}
