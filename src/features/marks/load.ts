import type { DiffFile } from "../../utils/diff-parser"
import { saveMarks } from "../../storage"
import { followMarks } from "./follow"
import type { Mark } from "./types"

/**
 * The marks just read off disk, moved onto the lines their text went to in
 * the diff they were loaded with: a PR reopened after new commits has
 * shifted under them just as a refresh would. Saved only when one moved.
 */
export async function followLoadedMarks(
  source: string,
  marks: readonly Mark[],
  files: readonly DiffFile[],
  head: string | undefined
): Promise<Mark[]> {
  const { marks: followed, moved } = followMarks(marks, files, head)
  if (moved) await saveMarks(source, followed)
  return followed
}
