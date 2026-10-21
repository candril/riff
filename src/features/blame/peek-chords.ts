import type { AppState } from "../../state"

const BLAME_PEEK_CHORDS = new Set(["go", "gb"])

/**
 * Whether a completed chord may act while a peek is up. The peeks let `g`
 * through only so their own chords can complete; anything else would move
 * the diff, open a panel or stack a second peek behind the modal one.
 */
export function chordAllowedUnderPeek(
  sequence: string,
  state: Pick<AppState, "blamePeek" | "showLinePeek" | "viewMode">,
): boolean {
  if (state.blamePeek && state.viewMode === "diff") return BLAME_PEEK_CHORDS.has(sequence)
  if (state.showLinePeek) return sequence === "gl"
  return true
}
