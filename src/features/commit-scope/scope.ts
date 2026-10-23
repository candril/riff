import { setViewingCommit, type AppState } from "../../state"
import type { FileContentState } from "../file-content/state"
import type { CommitDiffsState } from "./diffs-state"
import { commitScopeKey } from "./key"

/**
 * Bring a commit into scope, or with `null` go back to the whole review
 * (spec 078). What riff read of a file belongs to the span it read it for:
 * the rows now on screen are a different diff, between different ends, so
 * the expanded context goes with the old span. A commit whose diff is not
 * cached yet changes nothing, and so drops nothing either.
 */
export function scopeToCommit(
  state: AppState,
  commitDiffs: Pick<CommitDiffsState, "entry">,
  fileContent: Pick<FileContentState, "forgetSpan">,
  commitSha: string | null,
  scope?: readonly string[] | null,
): AppState {
  const cached = commitSha === null ? null : commitDiffs.entry(commitScopeKey(commitSha, scope))
  const next = setViewingCommit(state, commitSha, scope, cached)
  if (next !== state) fileContent.forgetSpan()
  return next
}
