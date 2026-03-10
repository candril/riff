/**
 * App initialization
 *
 * Loads diff data, comments, sessions, and builds the initial AppState.
 * Also sets up the renderer and UI panel instances.
 */

import { createCliRenderer } from "@opentui/core"
import { registerSyntaxParsers } from "../syntax-parsers"
import { VimDiffView, PRInfoPanelClass } from "../components"
import { FileTreePanel } from "../components/FileTreePanel"
import { CommentsViewPanel } from "../components/CommentsViewPanel"
import { getLocalDiff, getDiffDescription } from "../providers/local"
import { parseDiff, sortFiles } from "../utils/diff-parser"
import { buildFileTree } from "../utils/file-tree"
import {
  createInitialState,
  collapseResolvedThreads,
  loadFileStatuses,
  updateFileStatuses,
  collapseViewedFiles,
  type AppState,
} from "../state"
import { loadOrCreateSession, loadComments, loadViewedStatuses } from "../storage"
import { type Comment, type AppMode } from "../types"
import type { PrInfo } from "../providers/github"
import { groupIntoThreads } from "../utils/threads"
import { getTreeSitterClient } from "@opentui/core"
import type { DiffLineMapping } from "../vim-diff/line-mapping"
import { DiffLineMapping as DiffLineMappingClass } from "../vim-diff/line-mapping"

export interface InitOptions {
  mode: AppMode
  target: string | undefined
  diff?: string
  comments?: Comment[]
  prInfo?: PrInfo
  githubViewedStatuses?: Map<string, boolean>
  headSha?: string
}

export interface InitResult {
  // Initial app state
  state: AppState
  // Source identifier
  source: string
  // Initial head SHA
  headSha: string
  // Renderer and UI panels
  renderer: Awaited<ReturnType<typeof createCliRenderer>>
  fileTreePanel: FileTreePanel
  vimDiffView: VimDiffView
  commentsViewPanel: CommentsViewPanel
}

/**
 * Load diff data and initialize app state
 */
export async function initializeAppState(options: InitOptions): Promise<{
  state: AppState
  source: string
  headSha: string
}> {
  const { mode, target, diff: preloadedDiff, comments: preloadedComments, prInfo, githubViewedStatuses, headSha } = options

  // Build source identifier
  const source =
    mode === "pr" && prInfo ? `gh:${prInfo.owner}/${prInfo.repo}#${prInfo.number}` : target ?? "local"

  // Get diff content
  let rawDiff = ""
  let description = ""
  let error: string | null = null
  let comments: Comment[] = []

  if (mode === "pr" && preloadedDiff !== undefined) {
    rawDiff = preloadedDiff
    description = prInfo ? `#${prInfo.number}: ${prInfo.title}` : "Pull Request"
    comments = preloadedComments ?? []
  } else {
    try {
      rawDiff = await getLocalDiff(target)
      description = await getDiffDescription(target)
    } catch (err) {
      error = err instanceof Error ? err.message : "Unknown error"
    }
    comments = await loadComments(source)
  }

  // Parse diff and build tree
  const files = sortFiles(parseDiff(rawDiff))
  const fileTree = buildFileTree(files)

  // Load or create session
  const session = await loadOrCreateSession(source)

  // Initialize state
  let state = createInitialState(files, fileTree, source, description, error, session, comments, mode, prInfo ?? null)

  // Collapse resolved threads by default
  const threads = groupIntoThreads(comments)
  state = collapseResolvedThreads(state, threads)

  // Load viewed file statuses (merge local + GitHub)
  const localViewedStatuses = await loadViewedStatuses(source)
  state = loadFileStatuses(state, localViewedStatuses)

  // In PR mode, merge GitHub viewed statuses
  if (mode === "pr" && githubViewedStatuses && headSha) {
    const mergedStatuses = new Map(state.fileStatuses)
    for (const [filename, viewed] of githubViewedStatuses) {
      const existing = mergedStatuses.get(filename)
      if (!existing) {
        mergedStatuses.set(filename, {
          filename,
          viewed,
          viewedAt: viewed ? new Date().toISOString() : undefined,
          viewedAtCommit: viewed ? headSha : undefined,
          githubSynced: true,
          syncedAt: new Date().toISOString(),
        })
      } else if (viewed !== existing.viewed) {
        mergedStatuses.set(filename, {
          ...existing,
          viewed,
          viewedAt: viewed ? new Date().toISOString() : undefined,
          viewedAtCommit: viewed ? headSha : undefined,
          githubSynced: true,
          syncedAt: new Date().toISOString(),
        })
      } else {
        mergedStatuses.set(filename, {
          ...existing,
          githubSynced: true,
        })
      }
    }
    state = updateFileStatuses(state, mergedStatuses)
  }

  // Collapse viewed files initially
  state = collapseViewedFiles(state)

  return { state, source, headSha: headSha ?? "" }
}

/**
 * Build a DiffLineMapping from current state
 */
export function buildLineMapping(state: AppState): DiffLineMapping {
  const mappingMode = state.selectedFileIndex === null ? "all" : "single"

  const fileContents = new Map<string, string>()
  for (const [filename, cache] of Object.entries(state.fileContentCache)) {
    if (cache.newContent) {
      fileContents.set(filename, cache.newContent)
    }
  }

  return new DiffLineMappingClass(state.files, mappingMode, state.selectedFileIndex ?? undefined, {
    expandedDividers: state.expandedDividers,
    fileContents,
    collapsedFiles: state.collapsedFiles,
    collapsedHunks: state.collapsedHunks,
  })
}

/**
 * Set up the renderer and UI panel instances
 */
export async function initializeRenderer(): Promise<{
  renderer: Awaited<ReturnType<typeof createCliRenderer>>
  fileTreePanel: FileTreePanel
  vimDiffView: VimDiffView
  commentsViewPanel: CommentsViewPanel
}> {
  // Register additional syntax highlighting parsers
  registerSyntaxParsers()

  // Initialize tree-sitter client
  const tsClient = getTreeSitterClient()
  await tsClient.initialize()

  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
  })

  const fileTreePanel = new FileTreePanel({ renderer, width: 35 })
  const vimDiffView = new VimDiffView({ renderer })
  const commentsViewPanel = new CommentsViewPanel({ renderer })

  return { renderer, fileTreePanel, vimDiffView, commentsViewPanel }
}
