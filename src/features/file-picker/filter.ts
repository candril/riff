import type { AppState } from "../../state"
import type { FilteredFile } from "../../components"
import { fuzzyFilterMatches } from "../../utils/fuzzy"

export function getFilteredFiles(state: AppState, query: string): FilteredFile[] {
  const allFiles: FilteredFile[] = state.files.map((file, index) => {
    const viewed = state.fileStatuses.get(file.filename)?.viewed ?? false
    const commentCount = state.comments.filter((c) => c.filename === file.filename).length
    return { file, index, viewed, commentCount }
  })
  if (!query) return allFiles

  // Basename first: a query is almost always aimed at the file, not the
  // directories above it, so `input` should rank `a/b/input.ts` over
  // `input/deeply/nested/other.ts`.
  const basename = (filename: string) => filename.slice(filename.lastIndexOf("/") + 1)
  return fuzzyFilterMatches(query, allFiles, (f) => [basename(f.file.filename), f.file.filename]).map(
    ({ item, field, positions }) => {
      const dirLength = field === 0 ? item.file.filename.length - basename(item.file.filename).length : 0
      return { ...item, matched: positions.map((p) => p + dirLength) }
    }
  )
}
