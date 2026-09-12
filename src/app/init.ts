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
import { buildFileTree, filteredFilenames, collapseTree, expandToFile } from "../utils/file-tree"
import { wasRebased } from "../utils/visit"
import {
  createInitialState,
  collapseResolvedThreads,
  loadFileStatuses,
  updateFileStatuses,
  collapseViewedFiles,
  type AppState,
} from "../state"
import { loadOrCreateSession, loadComments, loadViewedStatuses, loadVisit } from "../storage"
import { type Comment, type AppMode } from "../types"
import type { PrInfo } from "../providers/github"
import { PR_COMMITS_FETCH_LIMIT } from "../providers/github"
import { groupIntoThreads } from "../utils/threads"
import { getTreeSitterClient } from "@opentui/core"
import type { DiffLineMapping } from "../vim-diff/line-mapping"
import { DiffLineMapping as DiffLineMappingClass } from "../vim-diff/line-mapping"
import { loadConfig } from "../config"
import { IgnoreMatcher } from "../utils/ignore"
import { buildFilesDiff, type FilesTarget } from "../providers/files"

export interface InitOptions {
  mode: AppMode
  target: string | undefined
  filesTarget?: FilesTarget
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
  const { mode, target, filesTarget, diff: preloadedDiff, comments: preloadedComments, prInfo, githubViewedStatuses, headSha } = options

  // Build source identifier. A path is a way of looking at the working copy,
  // so its store is the working copy's (spec 084).
  const source = filesTarget
    ? "local"
    : mode === "pr" && prInfo
      ? `gh:${prInfo.owner}/${prInfo.repo}#${prInfo.number}`
      : target ?? "local"

  const isPreloadedPr = mode === "pr" && preloadedDiff !== undefined

  // Nothing below depends on anything else below, and in local mode each
  // entry costs a process spawn — so ask for all of it at once.
  const [localDiff, localBranchInfo, localCommits, loadedComments, session, localViewedStatuses] =
    await Promise.all([
      isPreloadedPr || filesTarget ? null : loadLocalDiff(target),
      // A path is not a revision, so there is no branch and no commit range
      // behind it to describe.
      mode === "local" && !filesTarget ? getBranchInfo(target) : null,
      mode === "local" && !filesTarget ? getLocalCommits(target).catch(() => []) : null,
      isPreloadedPr ? null : loadComments(source),
      loadOrCreateSession(source),
      loadViewedStatuses(source),
    ])
  const visit = mode === "pr" ? await loadVisit(source) : null

  // The config's ignore patterns are applied downstream, where they collapse
  // a file rather than hide it; ripgrep has already applied `.gitignore`.
  const filesDiff = filesTarget ? await buildFilesDiff(filesTarget) : null

  const rawDiff = filesDiff ? filesDiff.diff : isPreloadedPr ? preloadedDiff! : localDiff!.diff
  const description = filesDiff
    ? describeFiles(filesTarget!, filesDiff)
    : isPreloadedPr
      ? prInfo
        ? `#${prInfo.number}: ${prInfo.title}`
        : "Pull Request"
      : localDiff!.description
  const error = isPreloadedPr || filesDiff ? null : localDiff!.error
  const comments = isPreloadedPr ? preloadedComments ?? [] : loadedComments!
  const branchInfo = localBranchInfo

  // Parse diff and build tree. In file mode nothing changed, and the tree
  // should not claim otherwise — `parseDiff` reads a same-name, same-content
  // file as a modification because that is all a diff can say.
  const parsed = parseDiff(rawDiff)
  const files = sortFiles(
    filesDiff ? parsed.map((file) => ({ ...file, status: "unchanged" as const })) : parsed
  )
  const fileTree = buildFileTree(files)

  // Load config and create ignore matcher
  const config = loadConfig()
  const ignoreMatcher = new IgnoreMatcher(config.ignore.patterns)

  // Initialize state (with ignore matcher)
  let state = createInitialState(files, fileTree, source, description, error, session, comments, mode, prInfo ?? null, ignoreMatcher)

  // Set branch info for local mode
  state = {
    ...state,
    fileMode: filesTarget !== undefined,
    branchInfo,
    wrapLines: config.diff.wrap,
    alignMarkdownTables: config.diff.alignMarkdownTables,
  }

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

  // When riff last had this PR open, and what had been read by then (spec
  // 069). A rewritten branch makes "changed since then" unanswerable from
  // commits, so it is noted rather than guessed at.
  state = {
    ...state,
    visit,
    visitRebased: wasRebased(visit, prInfo?.commits ?? [], PR_COMMITS_FETCH_LIMIT),
  }

  // Collapse viewed files initially
  state = collapseViewedFiles(state)

  // File mode opens on one file, and the tree opens folded except for the
  // path down to it. A repository is browsed a file at a time; listed flat
  // and expanded it is neither a tree nor anything anyone reads.
  if (filesDiff) {
    const opening = filesDiff.selected ?? files[0]?.filename ?? null
    const index = opening ? files.findIndex((file) => file.filename === opening) : -1
    state = {
      ...state,
      selectedFileIndex: index >= 0 ? index : null,
      fileTree: opening ? expandToFile(collapseTree(state.fileTree), opening) : state.fileTree,
      treeHighlightIndex: 0,
    }
  }

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
 * What the header says riff is showing, when it is showing files.
 *
 * The counts are there because both of them are silent otherwise: a walk
 * without ripgrep quietly includes everything, and a repo past the ceiling
 * quietly shows part of itself.
 */
function describeFiles(target: FilesTarget, files: { filenames: string[]; omitted: number; fallbackReason: string | null }): string {
  const what = target.directory
    ? `${target.path} — ${files.filenames.length} ${files.filenames.length === 1 ? "file" : "files"}`
    : target.path
  const omitted = files.omitted > 0 ? `, ${files.omitted} more not opened` : ""
  const fallback = files.fallbackReason ? ` (${files.fallbackReason})` : ""
  return what + omitted + fallback
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
    collapsedBlocks: state.collapsedBlocks,
    visibleFiles: filteredFilenames(state.fileTree, state.treeFilter) ?? undefined,
    outsideDiff: state.fileMode,
    // Wrapped, the padding is worse than useless: it is the widest cell in
    // the table spent on every row, wrapping into blank lines, and the
    // column it was lining up has been broken across rows anyway.
    alignMarkdownTables: state.alignMarkdownTables && !state.wrapLines,
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
