/**
 * The one place that reads both sides of a file, for expanded context,
 * highlighting and search. PR mode pins to the head riff loaded and to the
 * PR's base ref rather than resolving either again: each lookup would be a
 * `gh pr view`, a GraphQL request, on every expand. What it reads from gh,
 * git and jj comes in as sources, so a test can pin which revisions each
 * branch reads.
 */

import type { AppState } from "../../state"
import { getPrFileContent, getPrBaseFileContent, getFileContentAtRef } from "../../providers/github/content"
import { getFileContent, getOldFileContent } from "../../providers/local"
import { spanBaseRef, type CommitScopeLoadContext } from "../commit-scope/load"
import { scopeSpan } from "../commit-scope/span"
import type { FetchFileVersions } from "./load"

export interface FileVersionSources {
  getPrFileContent: typeof getPrFileContent
  getPrBaseFileContent: typeof getPrBaseFileContent
  getFileContentAtRef: typeof getFileContentAtRef
  getFileContent: typeof getFileContent
  getOldFileContent: typeof getOldFileContent
}

export const liveFileVersionSources: FileVersionSources = {
  getPrFileContent,
  getPrBaseFileContent,
  getFileContentAtRef,
  getFileContent,
  getOldFileContent,
}

export interface FileVersionsContext {
  sources: FileVersionSources
  getState: () => AppState
  head: () => string | undefined
  target: string | undefined
  getCommitParentSha: CommitScopeLoadContext["getCommitParentSha"]
}

export function createFileVersionsReader(ctx: FileVersionsContext): FetchFileVersions {
  const { sources } = ctx
  return async (filename) => {
    const state = ctx.getState()
    // A commit in scope is a diff of its own, running between that span's
    // ends rather than the review's (spec 078).
    const span = scopeSpan(state)

    if (state.appMode === "pr" && state.prInfo) {
      const { owner, repo, number, baseRef } = state.prInfo
      const spanBase = span ? await spanBaseRef(ctx, span.oldest) : null
      const [head, base] = await Promise.all([
        span
          ? sources.getFileContentAtRef(owner, repo, filename, span.newest)
          : sources.getPrFileContent(owner, repo, number, filename, ctx.head()),
        spanBase
          ? sources.getFileContentAtRef(owner, repo, filename, spanBase)
          : sources.getPrBaseFileContent(owner, repo, number, filename, baseRef, ctx.head()),
      ])
      // A file added by the PR has no base version; that's not a failure.
      return head.ok
        ? { ok: true, newContent: head.content, oldContent: base.ok ? base.content : null }
        : { ok: false, error: head.error }
    }

    const [newContent, oldContent] = await Promise.all([
      sources.getFileContent(filename, span?.newest ?? ctx.target),
      sources.getOldFileContent(filename, span?.oldest ?? ctx.target),
    ])
    return newContent === null
      ? { ok: false, error: "Could not read file from the working tree" }
      : { ok: true, newContent, oldContent }
  }
}
