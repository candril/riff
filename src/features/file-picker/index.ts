/**
 * File Picker Feature
 *
 * Provides the fuzzy file finder functionality.
 * - Fuzzy search over files in the diff
 * - Shows viewed status and comment count
 * - Keyboard navigation (up/down, Ctrl+n/p)
 * - File selection and tree expansion
 */

export { getFilteredFiles } from "./filter"
export { registerFilePickerKeys, type FilePickerKeyDeps } from "./keys"
export { createFilePickerState, type FilePickerState, type FilePickerSnapshot } from "./state"
