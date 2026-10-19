import type { PrCheck, PrCheckAnnotation } from "../../providers/github"

/**
 * Fetch a check's annotations once, saying so on the way in and on the way
 * out, so whoever draws it shows loading → loaded/empty/error (spec 043).
 * The check is mutated in place: annotations are session-local, and app
 * state does not carry them.
 */
export async function loadCheckAnnotations(
  check: PrCheck,
  fetch: () => Promise<PrCheckAnnotation[]>,
  onChange: () => void
): Promise<void> {
  check.annotationsStatus = "loading"
  onChange()
  try {
    check.annotations = await fetch()
    check.annotationsStatus = "loaded"
  } catch {
    check.annotationsStatus = "error"
  }
  onChange()
}
