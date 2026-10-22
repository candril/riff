/**
 * Global marks (spec 101).
 *
 * `m{letter}` remembers a place in the review and `'{letter}` returns to it
 * from anywhere. A mark is a file, a line and a side rather than a row, so
 * folds, wrap, split and a refresh, which all renumber the rows, leave it
 * where it was; it is looked up again in whatever mapping is current. It
 * also keeps its line's text, so a diff that moved the line under it (new
 * commits, a rename) can move it along.
 */

export type { Mark, LineAnchor, MarksState } from "./types"
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
export { markAt, anchorAt } from "./capture"
export { followMarks } from "./follow"
export { openFoldHiding, type FoldHidingContext } from "./fold-hiding"
export { resolveMark, markLandingMessage, type MarkLanding, type ResolvedMark } from "./resolve"
export { markLetterOf, isMarkQuote, markChordOpenedBy, markChordAction, pendingMarkChordGivesWay, chordTimeoutMs, type MarkChord, type MarkChordAction } from "./keys"
export { setMarkAtCursor, jumpToMark, flipMark, stepToMark, type MarksContext } from "./handlers"
export { markEntries, markLineText, markEntryLocation, filterMarkEntries, marksPickerEntries, type MarkEntry } from "./list"
export { createMarksPickerState, type MarksPickerState, type MarksPickerSnapshot } from "./picker-state"
export { registerMarksPickerKeys, type MarksPickerKeyDeps } from "./picker-keys"
