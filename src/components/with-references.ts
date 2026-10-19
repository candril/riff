import { resolvedReferences, referenceRepo } from "../features/references"
import { annotateReferences } from "../utils/references"

/**
 * A body with its `#412`s answered — the title and state of what they point
 * at, where riff has been told (spec 059).
 */
export function withReferences(body: string): string {
  return annotateReferences(body, resolvedReferences(), referenceRepo())
}
