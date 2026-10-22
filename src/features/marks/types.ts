export interface Mark {
  letter: string
  filename: string
  /** Null marks the file itself (spec 101, P3): it opens at its top. */
  line: number | null
  /** As CommentAnchor has it: LEFT counts the old file's lines, RIGHT the new one's. */
  side: "LEFT" | "RIGHT"
  /**
   * The marked line's source, without the diff's prefix and untrimmed, so a
   * refresh can find it again after the file shifted under it. Absent on a
   * file mark, on a mark set on expanded context (the patch a refresh
   * searches never carries those lines), and in marks.json files written
   * before marks kept it.
   */
  text?: string
  /** The head commit `line` was last checked against; absent in local mode. */
  head?: string
}

/** Where a mark stands without its letter; a jumplist entry is anchored the same way. */
export type LineAnchor = Pick<Mark, "filename" | "line" | "side" | "text">

export interface MarksState {
  marks: readonly Mark[]
  /** The last two marks visited, for `''`. Memory only: a session starts with neither. */
  current: string | null
  previous: string | null
}

export function emptyMarks(): MarksState {
  return { marks: [], current: null, previous: null }
}
