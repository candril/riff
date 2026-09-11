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

export {
  handleInput,
  getFilteredCommits,
  markedCommits,
  type CommitPickerInputContext,
} from "./input"

// Re-export state operations
export { openCommitPicker, closeCommitPicker } from "../../state"
