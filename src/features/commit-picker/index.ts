/**
 * Commit Picker Feature
 *
 * Provides commit selection for filtering the diff to a single commit's changes.
 * - Fuzzy search over commits by message or SHA
 * - Keyboard navigation (j/k, up/down, Ctrl+n/p)
 * - ]g/[g to cycle commits without opening the picker
 * - Works in both PR and local mode
 */

export { handleInput, getFilteredCommits, type CommitPickerInputContext } from "./input"

// Re-export state operations
export { openCommitPicker, closeCommitPicker } from "../../state"
