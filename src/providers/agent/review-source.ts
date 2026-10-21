import type { Comment } from "../../types"
import type { DiffFile } from "../../utils/diff-parser"

export type Side = "head" | "base"

export type FileText = { kind: "text"; text: string } | { kind: "missing" } | { kind: "binary" }

// A tree source ends its list with this line when it could not list every path; listing a
// directory keeps it, so the agent knows a path it misses may still exist.
export const TREE_CUT_OFF = "[The list is cut off here; read_file still reads any path.]"

// What the agent's tools read: the loaded change, any file of the repository at the review's
// head or base, and the review's comments. Nothing else of the review reaches the agent.
export interface ReviewSource {
  files(): readonly DiffFile[]
  // The files the reviewer's ignore patterns hide: the agent lists what the reviewer sees.
  hiddenPaths(): ReadonlySet<string>
  fileText(path: string, side: Side): Promise<FileText>
  tree(): Promise<readonly string[]>
  comments(): readonly Comment[]
}
