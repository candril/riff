/**
 * Commit Picker Feature
 *
 * Provides commit selection for filtering the diff to one commit's changes,
 * or to a span of them (spec 078).
 * - Fuzzy search over commits by message or SHA
 * - Keyboard navigation (j/k, up/down, Ctrl+n/p)
 * - ]g/[g to cycle commits without opening the picker
 * - Works in both PR and local mode
 */

export { getFilteredCommits, markedCommits } from "./filter"
export { registerCommitPickerKeys, type CommitPickerKeyDeps } from "./keys"
export { createCommitPickerState, type CommitPickerState, type CommitPickerSnapshot } from "./state"
