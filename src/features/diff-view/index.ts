/**
 * Diff View Feature
 *
 * Provides diff view input handling.
 * - Vim-like navigation (delegated to vim handler)
 * - c for comment
 * - V for visual line mode
 * - v for toggle viewed
 * - / ? * # n N for search
 * - S for submit comment
 * - Enter for divider expansion
 */

export { handleInput, type DiffViewInputContext } from "./input"
