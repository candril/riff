import type { DiffLine } from "../../vim-diff/types"
import { gitSidesOf, type GitBase } from "../git-target"
import { workingCopyOf } from "../local"

export type BlameSide = "head" | "base"

/**
 * The revision one side of the review is blamed in, before any merge base is looked up. `live`
 * marks a working copy, which changes under a running riff.
 */
export type SideRevision =
  | { tool: "jj"; rev: string; live: boolean }
  // A null rev is git's working tree.
  | { tool: "git"; rev: GitBase | null; live: boolean }
  | { tool: "github"; rev: { commit: string } | { mergeBaseOf: [string, string] }; live: false }

export const blameSideOf = (type: DiffLine["type"]): BlameSide => (type === "deletion" ? "base" : "head")

/** The same revisions getLocalDiff diffs and getFileContent / getOldFileContent read. */
export function jjSide(side: BlameSide, target?: string): SideRevision {
  const workingCopy = workingCopyOf(target)
  if (side === "base") return { tool: "jj", rev: workingCopy ? "trunk()" : `${target}-`, live: false }
  return workingCopy ? { tool: "jj", rev: workingCopy, live: true } : { tool: "jj", rev: target!, live: false }
}

export function gitSide(side: BlameSide, target?: string): SideRevision {
  if (!target) return side === "head" ? { tool: "git", rev: null, live: true } : { tool: "git", rev: { rev: "HEAD" }, live: false }
  const sides = gitSidesOf(target)
  return { tool: "git", rev: side === "head" ? { rev: sides.head } : sides.base, live: false }
}

/** The PR's head commit, or where it last met its base, as baseVersionRef resolves it. */
export function prSide(side: BlameSide, baseRef: string, headSha: string): SideRevision {
  return { tool: "github", rev: side === "head" ? { commit: headSha } : { mergeBaseOf: [baseRef, headSha] }, live: false }
}

export function revisionLabel(revision: SideRevision): string {
  const { rev } = revision
  if (rev === null) return "working tree"
  if (typeof rev === "string") return rev
  if ("commit" in rev) return rev.commit
  if ("rev" in rev) return rev.rev
  return `${rev.mergeBaseOf[0]}...${rev.mergeBaseOf[1]}`
}
