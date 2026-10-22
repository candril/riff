/** What of OpenTUI's textarea a range splice needs. */
export interface RangeTextarea {
  readonly plainText: string
  cursorOffset: number
  replaceText(text: string): void
}

/**
 * Splices `replacement` over `[start, end)` and leaves the cursor after
 * it. `replaceText` rather than `setText` keeps it one undo step, so
 * Ctrl-z rolls an accepted pick back.
 */
export function replaceTextRange(textarea: RangeTextarea, start: number, end: number, replacement: string): void {
  const text = textarea.plainText
  const safeStart = Math.max(0, Math.min(text.length, start))
  const safeEnd = Math.max(safeStart, Math.min(text.length, end))
  textarea.replaceText(text.slice(0, safeStart) + replacement + text.slice(safeEnd))
  textarea.cursorOffset = safeStart + replacement.length
}
