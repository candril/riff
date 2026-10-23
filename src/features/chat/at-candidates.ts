import type { AppState } from "../../state"
import type { AtPickerRow } from "../../components/at-picker"
import { getStatusIndicator } from "../../components/file-tree-model"
import { getFileColor } from "../../utils/file-colors"

/** One thing a question's `@` can name, as the picker offers it. */
export interface AtCandidate extends AtPickerRow {
  /** What a query is matched against, the strongest first. */
  keys: string[]
}

const basename = (path: string) => path.slice(path.lastIndexOf("/") + 1)

/**
 * What `@` attaches in this review (spec 102), in the order a reviewer
 * reaches for it. The paths are the change's own files and `@pr` is
 * offered only with the PR loaded, so neither is refused on send.
 * `@line`, `@selection` and `@file` are always offered, and a question
 * refuses them with the cursor on no line, nothing selected or no file
 * under the cursor.
 */
export function chatAtCandidates(state: AppState): AtCandidate[] {
  const named = (name: string): AtCandidate => ({ text: `@${name}`, keys: [name] })
  const files = state.files.map(
    (file): AtCandidate => ({
      text: `@${file.filename}`,
      fg: getFileColor(file.filename),
      detail: [getStatusIndicator(file.status).trim(), `+${file.additions} -${file.deletions}`].filter(Boolean).join("  "),
      // Basename first, as in the file picker: a query is almost always
      // aimed at the file, not the directories above it.
      keys: [basename(file.filename), file.filename],
    })
  )
  return [named("line"), named("selection"), named("file"), ...(state.prInfo ? [named("pr")] : []), ...files]
}
