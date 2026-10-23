/**
 * The per-commit diffs (spec 078): the files of each commit scope riff has
 * already fetched, keyed by `commitScopeKey`, so picking a scope again does
 * not fetch it again. It is what riff has already fetched, not review
 * state, so the feature owns it rather than AppState (spec 100, M6;
 * ADR-003). A reload, a switch to another PR, creating a PR and opening the
 * branch's PR drop it, since the commits it was fetched for are not the
 * new review's.
 */

import { createSignal } from "solid-js"
import type { DiffFile } from "../../utils/diff-parser"
import { buildFileTree, type FileTreeNode } from "../../utils/file-tree"

export interface CommitDiff {
  files: DiffFile[]
  fileTree: FileTreeNode[]
}

export type CommitDiffsState = ReturnType<typeof createCommitDiffsState>

export function createCommitDiffsState() {
  const [diffs, setDiffs] = createSignal<ReadonlyMap<string, CommitDiff>>(new Map())

  return {
    entry(key: string): CommitDiff | null {
      return diffs().get(key) ?? null
    },
    has(key: string): boolean {
      return diffs().has(key)
    },
    put(key: string, files: DiffFile[]) {
      setDiffs((cached) => new Map(cached).set(key, { files, fileTree: buildFileTree(files) }))
    },
    clear() {
      setDiffs(new Map())
    },
  }
}
