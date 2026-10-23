import type { TextareaRenderable } from "@opentui/core"

export type OnScreen = "@selection" | "@line" | "@file"

const hasToken = (text: string, token: OnScreen) =>
  new RegExp(`(?:^|\\s)${token === "@selection" ? "@(?:selection|s)" : token}(?:[.,;:!?)]*)(?:\\s|$)`).test(text)

/** The input with `token` put in front, or null when it is already there. */
export function withToken(text: string, token: OnScreen): string | null {
  return hasToken(text, token) ? null : `${token} ${text}`
}

/** What is on screen: the selection in visual mode, else the cursor's line, else (on a file header) the file. */
export function onScreenToken(visual: boolean, onLine: boolean): OnScreen {
  if (visual) return "@selection"
  return onLine ? "@line" : "@file"
}

/**
 * Ctrl-r from the diff asks about what is on screen. The token goes in
 * front, so what was already typed reads as the question about it.
 */
export function attachOnScreen(input: TextareaRenderable | null, visual: boolean, onLine: boolean): void {
  if (!input) return
  const token = onScreenToken(visual, onLine)
  const next = withToken(input.plainText, token)
  if (next === null) return
  input.setText(next)
  input.cursorOffset = token.length + 1
}
