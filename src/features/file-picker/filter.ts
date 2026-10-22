import type { AppState } from "../../state"
import type { FilteredFile } from "../../components"
import { fuzzyFilter } from "../../utils/fuzzy"

export function getFilteredFiles(state: AppState, query: string): FilteredFile[] {
  const allFiles: FilteredFile[] = state.files.map((file, index) => {
    const viewed = state.fileStatuses.get(file.filename)?.viewed ?? false
    const commentCount = state.comments.filter((c) => c.filename === file.filename).length
    return { file, index, viewed, commentCount }
  })

  // Basename first: a query is almost always aimed at the file, not the
  // directories above it, so `input` should rank `a/b/input.ts` over
  // `input/deeply/nested/other.ts`.
  return query
    ? fuzzyFilter(query, allFiles, (f) => [
        f.file.filename.split("/").pop() ?? f.file.filename,
        f.file.filename,
      ])
    : allFiles
}
