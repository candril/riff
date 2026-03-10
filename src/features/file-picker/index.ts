/**
 * File Picker Feature
 *
 * Provides the fuzzy file finder functionality.
 * - Fuzzy search over files in the diff
 * - Shows viewed status and comment count
 * - Keyboard navigation (j/k, up/down, Ctrl+n/p)
 * - File selection and tree expansion
 */

export { handleInput, getFilteredFiles, type FilePickerInputContext } from "./input"

// Re-export state operations that callers might need
export { openFilePicker, closeFilePicker } from "../../state"
