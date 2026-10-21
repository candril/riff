import type { TextareaRenderable } from "@opentui/core"

export type OnScreen = "@selection" | "@file"

const hasToken = (text: string, token: OnScreen) =>
  new RegExp(`(?:^|\\s)${token === "@selection" ? "@(?:selection|s)" : token}(?:[.,;:!?)]*)(?:\\s|$)`).test(text)

/** The input with `token` put in front, or null when it is already there. */
export function withToken(text: string, token: OnScreen): string | null {
  return hasToken(text, token) ? null : `${token} ${text}`
}

/**
 * Ctrl-r from the diff asks about what is on screen: the selection in
 * visual mode, the file otherwise. The token goes in front, so what was
 * already typed reads as the question about it.
 */
export function attachOnScreen(input: TextareaRenderable | null, visual: boolean): void {
  if (!input) return
  const token: OnScreen = visual ? "@selection" : "@file"
  const next = withToken(input.plainText, token)
  if (next === null) return
  input.setText(next)
  input.cursorOffset = token.length + 1
}
