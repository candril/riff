/**
 * The markdown files shown rendered in place of their diff (spec 111).
 *
 * How the reader chose to read a file, not review state, so the feature
 * owns it rather than AppState (ADR-003). A switch to another review drops
 * it: its filenames name files in the last review. A reload keeps it, and
 * reads the files' new versions again (reload.ts).
 */

import { createSignal } from "solid-js"
import { renderMarkdown, type RenderedRow } from "./render"

export type RenderedMarkdownState = ReturnType<typeof createRenderedMarkdownState>

export function createRenderedMarkdownState() {
  const [files, setFiles] = createSignal<ReadonlySet<string>>(new Set())
  // Every rebuild of the mapping asks again; lexing an unchanged file each time would be waste.
  const rendered = new Map<string, { content: string; rows: readonly RenderedRow[] }>()

  return {
    files,
    has(filename: string): boolean {
      return files().has(filename)
    },
    toggle(filename: string) {
      setFiles((current) => {
        const next = new Set(current)
        if (next.has(filename)) next.delete(filename)
        else next.add(filename)
        return next
      })
    },
    retain(keep: (filename: string) => boolean) {
      const kept = new Set([...files()].filter(keep))
      if (kept.size === files().size) return
      setFiles(kept)
    },
    clear() {
      rendered.clear()
      if (files().size === 0) return
      setFiles(new Set<string>())
    },
    /**
     * True when a rendered file's new version has landed, or changed, since
     * the mapping last rendered it: loading it ends in a render, not in a
     * rebuild of the mapping, and the file would go on showing its diff.
     */
    stale(contentOf: (filename: string) => string | undefined): boolean {
      for (const filename of files()) {
        const content = contentOf(filename)
        if (content !== undefined && rendered.get(filename)?.content !== content) return true
      }
      return false
    },
    rowsFor(filename: string, content: string): readonly RenderedRow[] {
      const cached = rendered.get(filename)
      if (cached?.content === content) return cached.rows
      const rows = renderMarkdown(content)
      rendered.set(filename, { content, rows })
      return rows
    },
  }
}
