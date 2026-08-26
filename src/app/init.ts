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
import { getLocalDiff, getDiffDescription, getBranchInfo, getLocalCommits } from "../providers/local"
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
import { loadConfig } from "../config"
import { IgnoreMatcher } from "../utils/ignore"

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

  const isPreloadedPr = mode === "pr" && preloadedDiff !== undefined

  // Nothing below depends on anything else below, and in local mode each
  // entry costs a process spawn — so ask for all of it at once.
  const [localDiff, localBranchInfo, localCommits, loadedComments, session, localViewedStatuses] =
    await Promise.all([
      isPreloadedPr ? null : loadLocalDiff(target),
      mode === "local" ? getBranchInfo(target) : null,
      mode === "local" ? getLocalCommits(target).catch(() => []) : null,
      isPreloadedPr ? null : loadComments(source),
      loadOrCreateSession(source),
      loadViewedStatuses(source),
    ])

  const rawDiff = isPreloadedPr ? preloadedDiff! : localDiff!.diff
  const description = isPreloadedPr
    ? prInfo
      ? `#${prInfo.number}: ${prInfo.title}`
      : "Pull Request"
    : localDiff!.description
  const error = isPreloadedPr ? null : localDiff!.error
  const comments = isPreloadedPr ? preloadedComments ?? [] : loadedComments!
  const branchInfo = localBranchInfo

  // Parse diff and build tree
  const files = sortFiles(parseDiff(rawDiff))
  const fileTree = buildFileTree(files)

  // Load config and create ignore matcher
  const config = loadConfig()
  const ignoreMatcher = new IgnoreMatcher(config.ignore.patterns)

  // Initialize state (with ignore matcher)
  let state = createInitialState(files, fileTree, source, description, error, session, comments, mode, prInfo ?? null, ignoreMatcher)

  // Set branch info for local mode
  state = { ...state, branchInfo }

  // Commits for the diff range: PR mode gets them with the rest of the PR,
  // local mode enumerated them above.
  if (mode === "pr" && prInfo?.commits && prInfo.commits.length > 0) {
    state = { ...state, commits: prInfo.commits }
  } else if (localCommits) {
    state = { ...state, commits: localCommits }
  }

  // Collapse resolved threads by default
  const threads = groupIntoThreads(comments)
  state = collapseResolvedThreads(state, threads)

  // Load viewed file statuses (merge local + GitHub)
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

  // Auto-collapse ignored files in diff view
  if (state.ignoredFiles.size > 0) {
    const newCollapsed = new Set(state.collapsedFiles)
    for (const filename of state.ignoredFiles) {
      newCollapsed.add(filename)
    }
    state = { ...state, collapsedFiles: newCollapsed }
  }

  return { state, source, headSha: headSha ?? "" }
}

/**
 * The local diff and its description, with a failure to read either surfaced
 * as state rather than thrown — riff still opens, showing the error.
 */
async function loadLocalDiff(
  target: string | undefined
): Promise<{ diff: string; description: string; error: string | null }> {
  try {
    const [diff, description] = await Promise.all([
      getLocalDiff(target),
      getDiffDescription(target),
    ])
    return { diff, description, error: null }
  } catch (err) {
    return {
      diff: "",
      description: "",
      error: err instanceof Error ? err.message : "Unknown error",
    }
  }
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

  return { renderer, fileTreePanel, vimDiffView }
}
