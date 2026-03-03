/**
 * Utilities for viewed file status management
 * - Change detection (file changed since viewed)
 * - Stats computation
 */

import { $ } from "bun"
import type { FileReviewStatus, ViewedStats } from "../types"
import type { DiffFile } from "./diff-parser"

// ============================================================================
// Change Detection
// ============================================================================

export interface ChangeDetectionResult {
  isStale: boolean
  commitsBehind: number
  latestCommit: string
}

/**
 * Check if a file has changed since it was marked as viewed.
 * Uses git log to find commits that modified the file between viewedAtCommit and currentHead.
 * 
 * @param filename - The file to check
 * @param viewedAtCommit - The commit SHA when the file was marked as viewed
 * @param currentHead - The current HEAD commit SHA
 */
export async function checkFileChangedSinceViewed(
  filename: string,
  viewedAtCommit: string,
  currentHead: string
): Promise<ChangeDetectionResult> {
  try {
    // Get commits that touched this file since viewedAtCommit
    const result = await $`git log --oneline ${viewedAtCommit}..${currentHead} -- ${filename}`.text()
    
    const commits = result.trim().split("\n").filter(Boolean)
    
    return {
      isStale: commits.length > 0,
      commitsBehind: commits.length,
      latestCommit: currentHead,
    }
  } catch {
    // On error (e.g., invalid commit), assume not stale
    return {
      isStale: false,
      commitsBehind: 0,
      latestCommit: currentHead,
    }
  }
}

/**
 * Refresh viewed statuses with change detection.
 * Checks each viewed file to see if it has changed since being marked as viewed.
 * 
 * @param statuses - Map of current file statuses
 * @param currentHead - Current HEAD commit SHA
 */
export async function refreshViewedStatuses(
  statuses: Map<string, FileReviewStatus>,
  currentHead: string
): Promise<Map<string, FileReviewStatus>> {
  const updated = new Map<string, FileReviewStatus>()
  
  // Process in parallel for performance
  const entries = Array.from(statuses.entries())
  const results = await Promise.all(
    entries.map(async ([filename, status]) => {
      // Skip if not viewed or no viewedAtCommit
      if (!status.viewed || !status.viewedAtCommit) {
        return [filename, status] as const
      }
      
      // Already up to date with current head
      if (status.latestCommit === currentHead && status.isStale !== undefined) {
        return [filename, status] as const
      }
      
      const change = await checkFileChangedSinceViewed(
        filename,
        status.viewedAtCommit,
        currentHead
      )
      
      return [filename, {
        ...status,
        isStale: change.isStale,
        staleCommits: change.commitsBehind,
        latestCommit: change.latestCommit,
      }] as const
    })
  )
  
  for (const [filename, status] of results) {
    updated.set(filename, status)
  }
  
  return updated
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
 */
export function createViewedStatus(
  filename: string,
  headCommit: string,
  viewed: boolean
): FileReviewStatus {
  if (viewed) {
    return {
      filename,
      viewed: true,
      viewedAt: new Date().toISOString(),
      viewedAtCommit: headCommit,
      isStale: false,
      staleCommits: 0,
      latestCommit: headCommit,
      githubSynced: false,
    }
  } else {
    return {
      filename,
      viewed: false,
      viewedAt: undefined,
      viewedAtCommit: undefined,
      isStale: undefined,
      staleCommits: undefined,
      latestCommit: undefined,
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
