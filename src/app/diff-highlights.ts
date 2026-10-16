import { LineSpans } from "../diff-rows/line-spans"
import type { FileParses, Parse } from "../vim-diff/file-parses"

/**
 * The colours both diff views read: one LineSpans cache over the app's
 * file parses, and the version that tells a view its rows' spans may have
 * changed. One of each, so toggling between unified and split neither
 * parses a hunk twice nor draws one view with colours the other has not
 * been told about.
 */
export function createDiffHighlights(parses: FileParses, onLanded: () => void, parse?: Parse) {
  const lineSpans = new LineSpans(parses, parse)
  let version = 0

  function landed(): void {
    version++
    onLanded()
  }
  lineSpans.onSpans = landed
  // A file's own parse colours rows the fragment parse already did, so it lands the same way (spec 080).
  parses.onParsed = landed

  return {
    lineSpans,
    version: () => version,
    landed,
    dispose(): void {
      parses.onParsed = undefined
      lineSpans.dispose()
    },
  }
}

export type DiffHighlights = ReturnType<typeof createDiffHighlights>
