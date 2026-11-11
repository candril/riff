import { getFiletypeFromPath } from "../vim-diff/filetype"

const SUGGESTION_FENCE = /^(\s{0,3}(?:`{3,}|~{3,}))suggestion[ \t]*$/gm

/**
 * A ```suggestion block as riff draws it: fenced in the commented file's
 * language, so it is highlighted like the diff it replaces. Only the drawn
 * text changes — GitHub applies a block only when its fence says
 * `suggestion`, so the comment itself keeps it.
 */
export function suggestionsInFileLanguage(body: string, filename: string): string {
  const filetype = getFiletypeFromPath(filename)
  if (filetype === undefined) return body
  return body.replace(SUGGESTION_FENCE, (_, fence: string) => `${fence}${filetype}`)
}
