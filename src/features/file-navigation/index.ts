/**
 * File Navigation Feature
 *
 * Provides file navigation across the diff.
 * - ]f/[f: next/previous file
 * - ]u/[u: next/previous unviewed file
 * - ]o/[o: next/previous outdated file
 * - v: toggle viewed status
 */

export {
  navigateFileSelection,
  navigateToUnviewedFile,
  navigateToOutdatedFile,
  toggleViewedForFile,
  handleToggleViewed,
  handleSelectFile,
  type FileNavigationContext,
} from "./handlers"
