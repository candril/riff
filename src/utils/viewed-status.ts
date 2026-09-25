/**
 * Utilities for viewed file status management
 * - Change detection (file changed since viewed)
 * - Merging GitHub's viewed state
 * - Stats computation
 */

import { $ } from "bun"
import type { FileReviewStatus, ViewedStats } from "../types"
import type { ViewerViewedState } from "../providers/github"
import type { DiffFile } from "./diff-parser"

// ============================================================================
// Change Detection
// ============================================================================

/**
 * Fingerprint of a file's patch. A viewed file whose patch no longer matches
 * the one it was viewed at has changed since — in local mode that is often an
 * edit that is not yet a commit, which no comparison of commits would see.
 */
export function diffHash(file: DiffFile): string {
  return Bun.hash(file.content).toString(36)
}

/** `files` must be the whole diff, not a commit-scoped slice of it. */
export function markStaleFiles(
  statuses: Map<string, FileReviewStatus>,
  files: DiffFile[]
): Map<string, FileReviewStatus> {
  const hashes = new Map(files.map((file) => [file.filename, diffHash(file)]))
  const marked = new Map<string, FileReviewStatus>()
  for (const [filename, status] of statuses) {
    const current = hashes.get(filename)
    const isStale =
      status.viewed && status.viewedDiffHash !== undefined && current !== undefined
        ? status.viewedDiffHash !== current
        : status.isStale
    marked.set(filename, isStale === status.isStale ? status : { ...status, isStale })
  }
  return marked
}

/**
 * Fold GitHub's viewed state into the local one. GitHub is the authority in PR
 * mode: `DISMISSED` is its "viewed, but the file changed since", and `VIEWED`
 * vouches for the patch as it is now.
 */
export function mergeGitHubViewedStates(
  statuses: Map<string, FileReviewStatus>,
  github: Map<string, ViewerViewedState>,
  headSha: string,
  files: DiffFile[]
): Map<string, FileReviewStatus> {
  const merged = new Map(statuses)
  const byName = new Map(files.map((file) => [file.filename, file]))
  const now = new Date().toISOString()
  for (const [filename, state] of github) {
    const existing = merged.get(filename)
    const synced = { githubSynced: true, syncedAt: now }
    if (state === "UNVIEWED") {
      merged.set(filename, { ...createViewedStatus(filename, headSha, false), ...synced })
      continue
    }
    const file = byName.get(filename)
    const base: FileReviewStatus = existing?.viewed
      ? existing
      : createViewedStatus(filename, headSha, true, file)
    merged.set(filename, {
      ...base,
      ...synced,
      isStale: state === "DISMISSED",
      viewedDiffHash: state === "VIEWED" && file ? diffHash(file) : base.viewedDiffHash,
    })
  }
  return merged
}

/**
 * Get current git HEAD commit SHA
 */
export async function getHeadCommit(): Promise<string> {
  try {
    const result = await $`git rev-parse HEAD`.text()
    return result.trim()
  } catch {
    return ""
  }
}

// ============================================================================
// Stats Computation
// ============================================================================

/**
 * Compute viewed statistics from file statuses and file list.
 * 
 * @param statuses - Map of file statuses
 * @param files - List of diff files to include in stats
 */
export function computeViewedStats(
  statuses: Map<string, FileReviewStatus>,
  files: DiffFile[]
): ViewedStats {
  let viewed = 0
  let outdated = 0
  
  for (const file of files) {
    const status = statuses.get(file.filename)
    if (status?.viewed) {
      viewed++
      if (status.isStale) {
        outdated++
      }
    }
  }
  
  return {
    total: files.length,
    viewed,
    outdated,
  }
}

/**
 * Get filenames of outdated files (viewed but changed since).
 * 
 * @param statuses - Map of file statuses
 * @param files - List of diff files
 */
export function getOutdatedFiles(
  statuses: Map<string, FileReviewStatus>,
  files: DiffFile[]
): string[] {
  const outdated: string[] = []
  
  for (const file of files) {
    const status = statuses.get(file.filename)
    if (status?.viewed && status.isStale) {
      outdated.push(file.filename)
    }
  }
  
  return outdated
}

/**
 * Get filenames of unviewed files.
 * 
 * @param statuses - Map of file statuses  
 * @param files - List of diff files
 */
export function getUnviewedFiles(
  statuses: Map<string, FileReviewStatus>,
  files: DiffFile[]
): string[] {
  const unviewed: string[] = []
  
  for (const file of files) {
    const status = statuses.get(file.filename)
    if (!status?.viewed) {
      unviewed.push(file.filename)
    }
  }
  
  return unviewed
}

/**
 * Create a fresh FileReviewStatus for marking a file as viewed.
 * 
 * @param filename - The file being marked
 * @param headCommit - Current HEAD commit
 * @param viewed - Whether to mark as viewed (true) or unviewed (false)
 * @param file - The file as the whole diff shows it now
 */
export function createViewedStatus(
  filename: string,
  headCommit: string,
  viewed: boolean,
  file?: DiffFile
): FileReviewStatus {
  if (viewed) {
    return {
      filename,
      viewed: true,
      viewedAt: new Date().toISOString(),
      viewedAtCommit: headCommit,
      viewedDiffHash: file ? diffHash(file) : undefined,
      isStale: false,
      githubSynced: false,
    }
  } else {
    return {
      filename,
      viewed: false,
      viewedAt: undefined,
      viewedAtCommit: undefined,
      viewedDiffHash: undefined,
      isStale: undefined,
      githubSynced: false,
    }
  }
}

/**
 * Mark a file status as synced to GitHub.
 */
export function markAsSynced(status: FileReviewStatus): FileReviewStatus {
  return {
    ...status,
    githubSynced: true,
    syncedAt: new Date().toISOString(),
  }
}
