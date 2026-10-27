import type { FilesTarget } from "../providers/files"

/**
 * A path opened with --files shares the working copy's store for comments
 * (spec 084), but its conversation is about other files than the
 * uncommitted changes', so the chat is keyed by the path.
 */
export function chatKeyOf(source: string, filesTarget: FilesTarget | undefined): string {
  if (!filesTarget) return source
  return `files:${filesTarget.directory ? "dir" : "file"}:${filesTarget.path}`
}
