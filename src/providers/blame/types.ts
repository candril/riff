export interface BlameCommit {
  sha: string
  shortSha: string
  author: string
  /** ISO 8601. */
  date: string
  subject: string
}

export type BlameLine = { kind: "commit"; commit: BlameCommit } | { kind: "uncommitted" }

/** Indexed by 1-based line number, so index 0 is always empty. */
export type FileBlame = readonly (BlameLine | undefined)[]

export interface PrRef {
  number: number
  url: string
}

export const shortShaOf = (sha: string) => sha.slice(0, 8)
