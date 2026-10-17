/**
 * Global marks (spec 101).
 *
 * `m{letter}` remembers a place in the review and `'{letter}` returns to it
 * from anywhere. A mark is a file, a line and a side rather than a row, so
 * folds, wrap, split and a refresh, which all renumber the rows, leave it
 * where it was; it is looked up again in whatever mapping is current.
 */

export type { Mark, MarksState } from "./types"
export { createMarksState } from "./types"
export {
  isMarkLetter,
  setMark,
  deleteMark,
  visitMark,
  flipTarget,
  marksInOrder,
  stepMark,
} from "./store"
export { markAt } from "./capture"
export { resolveMark, markLandingMessage, type MarkLanding, type ResolvedMark } from "./resolve"
export { markLetterOf, isMarkQuote, markChordOpenedBy, markChordAction, type MarkChord, type MarkChordAction } from "./keys"
export { setMarkAtCursor, jumpToMark, flipMark, type MarksContext } from "./handlers"
