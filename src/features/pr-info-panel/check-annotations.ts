import type { PrCheck, PrCheckAnnotation } from "../../providers/github/types"

/**
 * Fetch a check's annotations, saying so on the way in and on the way out,
 * so whoever draws it shows loading → loaded/empty/error (spec 043). Every
 * call fetches; asking only once per check is the caller's rule.
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

export interface OpenFailingCheck {
  fetch: () => Promise<PrCheckAnnotation[]>
  /** Read on every change, not once: a refresh can rebuild the panel while the fetch is in flight. */
  currentPanel: () => { checksChanged(): void } | null
  render: () => void
}

/**
 * Load a failing check's annotations into whichever panel shows it when
 * each change lands. A rebuilt panel draws these same PrCheck objects, so
 * the one current at the settle is the one to tell.
 */
export function openFailingCheck(check: PrCheck, { fetch, currentPanel, render }: OpenFailingCheck): Promise<void> {
  return loadCheckAnnotations(check, fetch, () => {
    currentPanel()?.checksChanged()
    render()
  })
}
