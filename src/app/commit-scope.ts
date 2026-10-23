import { setViewingCommit, type AppState } from "../state"
import type { FileContentState } from "../features/file-content/state"

/**
 * Bring a commit into scope, or with `null` go back to the whole review
 * (spec 078). What riff read of a file belongs to the span it read it for:
 * the rows now on screen are a different diff, between different ends, so
 * the expanded context goes with the old span. A commit whose diff is not
 * cached yet changes nothing, and so drops nothing either.
 */
export function scopeToCommit(
  state: AppState,
  fileContent: Pick<FileContentState, "forgetSpan">,
  commitSha: string | null,
  scope?: readonly string[] | null,
): AppState {
  const next = setViewingCommit(state, commitSha, scope)
  if (next !== state) fileContent.forgetSpan()
  return next
}
