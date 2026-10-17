export interface Mark {
  letter: string
  filename: string
  /** Null marks the file itself (spec 101, P3): it opens at its top. */
  line: number | null
  /** As CommentAnchor has it: LEFT counts the old file's lines, RIGHT the new one's. */
  side: "LEFT" | "RIGHT"
}

export interface MarksState {
  marks: readonly Mark[]
  /** The last two marks visited, for `''`. Memory only: a session starts with neither. */
  current: string | null
  previous: string | null
}

export function createMarksState(): MarksState {
  return { marks: [], current: null, previous: null }
}

export interface MarksPickerState {
  open: boolean
  query: string
  selectedIndex: number
}
