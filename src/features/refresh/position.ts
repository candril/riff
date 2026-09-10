/**
 * Keeping your place across a refresh (spec 063).
 *
 * A reload rebuilds every index riff holds — the line mapping renumbers, the
 * files array reorders, the tree is built from scratch — so a position can
 * only survive as what it *pointed at*: a filename, a line number, a tree
 * path, looked up again once the new data is in.
 */

import type { AppState } from "../../state"
import type { DiffFile } from "../../utils/diff-parser"
import type { DiffLineMapping } from "../../vim-diff/line-mapping"
import type { SearchState } from "../../vim-diff/search-state"
import type { VimCursorState } from "../../vim-diff/types"
import { flattenTree } from "../../utils/file-tree"

/** What the cursor row pointed at. */
export interface CursorAnchor {
  filename: string
  /** LEFT carries the old line number, RIGHT the new one. */
  side: "LEFT" | "RIGHT"
  lineNum: number | undefined
  col: number
}

/**
 * How close the cursor got back to where it was. Everything but `exact` is
 * worth telling the reader about.
 */
export type Landing = "exact" | "nearby" | "file" | "top"

export interface RefreshPosition {
  viewMode: AppState["viewMode"]
  previousView: AppState["previousView"]
  feed: AppState["feed"]
  /** By name, not by index: the files array renumbers on every reload. */
  selectedFilename: string | null
  treeHighlightPath: string | null
  focusedPanel: AppState["focusedPanel"]
  showFilePanel: boolean
  filePanelExpanded: boolean
  treeFilter: string
  showHiddenFiles: boolean
  wrapLines: boolean
  alignMarkdownTables: boolean
  collapsedFiles: Set<string>
  collapsedHunks: Set<string>
  collapsedBlocks: Set<string>
  expandedDividers: Set<string>
  collapsedThreadIds: Set<string>
  prInfoPanel: AppState["prInfoPanel"]
  anchor: CursorAnchor | null
  search: SearchState
}

export function capturePosition(
  state: AppState,
  vim: VimCursorState,
  mapping: DiffLineMapping,
  search: SearchState
): RefreshPosition {
  const flatItems = flattenTree(state.fileTree, state.files)

  return {
    viewMode: state.viewMode,
    previousView: state.previousView,
    feed: state.feed,
    selectedFilename:
      state.selectedFileIndex === null
        ? null
        : state.files[state.selectedFileIndex]?.filename ?? null,
    treeHighlightPath: flatItems[state.treeHighlightIndex]?.node.path ?? null,
    focusedPanel: state.focusedPanel,
    showFilePanel: state.showFilePanel,
    filePanelExpanded: state.filePanelExpanded,
    treeFilter: state.treeFilter,
    showHiddenFiles: state.showHiddenFiles,
    wrapLines: state.wrapLines,
    alignMarkdownTables: state.alignMarkdownTables,
    collapsedFiles: new Set(state.collapsedFiles),
    collapsedHunks: new Set(state.collapsedHunks),
    collapsedBlocks: new Set(state.collapsedBlocks),
    expandedDividers: new Set(state.expandedDividers),
    collapsedThreadIds: new Set(state.collapsedThreadIds),
    prInfoPanel: state.prInfoPanel,
    anchor: captureAnchor(mapping, vim),
    search,
  }
}

/**
 * Put the view back, over freshly loaded data. The folds are restored as
 * they were and the reload's own decisions — a file that just became viewed
 * or ignored — are unioned on top by the caller afterwards.
 */
export function restorePosition(state: AppState, position: RefreshPosition): AppState {
  const selectedFileIndex = findFileIndex(state.files, position.selectedFilename)
  const flatItems = flattenTree(state.fileTree, state.files)
  const treeHighlightIndex = position.treeHighlightPath
    ? Math.max(0, flatItems.findIndex((item) => item.node.path === position.treeHighlightPath))
    : 0

  return {
    ...state,
    viewMode: position.viewMode,
    previousView: position.previousView,
    feed: position.feed,
    selectedFileIndex,
    treeHighlightIndex,
    focusedPanel: position.focusedPanel,
    showFilePanel: position.showFilePanel,
    filePanelExpanded: position.filePanelExpanded,
    treeFilter: position.treeFilter,
    showHiddenFiles: position.showHiddenFiles,
    wrapLines: position.wrapLines,
    alignMarkdownTables: position.alignMarkdownTables,
    collapsedFiles: new Set(position.collapsedFiles),
    collapsedHunks: new Set(position.collapsedHunks),
    collapsedBlocks: new Set(position.collapsedBlocks),
    expandedDividers: new Set(position.expandedDividers),
    collapsedThreadIds: new Set(position.collapsedThreadIds),
    prInfoPanel: position.prInfoPanel,
  }
}

/**
 * The pattern survives a refresh; its matches do not — they are visual line
 * indices into a mapping that no longer exists. Rebuilding the mapping
 * recomputes them (`SearchHandler.refreshMatches`).
 */
export function restoreSearch(search: SearchState): SearchState {
  return {
    ...search,
    active: false,
    matches: [],
    currentMatchIndex: -1,
    wrapped: false,
    loading: false,
    error: null,
  }
}

function findFileIndex(files: DiffFile[], filename: string | null): number | null {
  if (filename === null) return null
  const index = files.findIndex((file) => file.filename === filename)
  return index === -1 ? null : index
}

/**
 * What the cursor row points at. A file header, a divider or the spacing
 * between files carries no line number of its own, so the nearest numbered
 * row above it — still inside the same file — stands in for it.
 */
export function captureAnchor(mapping: DiffLineMapping, vim: VimCursorState): CursorAnchor | null {
  const row = mapping.getLine(vim.line)
  if (!row?.filename) return null

  for (let i = vim.line; i >= 0; i--) {
    const candidate = mapping.getLine(i)
    if (!candidate || candidate.filename !== row.filename) break
    const side = sideOf(candidate.type)
    const lineNum = side === "LEFT" ? candidate.oldLineNum : candidate.newLineNum
    if (lineNum !== undefined) return { filename: row.filename, side, lineNum, col: vim.col }
  }

  return { filename: row.filename, side: "RIGHT", lineNum: undefined, col: vim.col }
}

/**
 * Find the anchor again in a rebuilt mapping. Falls back down the chain the
 * spec asks for: the same line, the nearest line in that file, the file's
 * first row, the top.
 */
export function relocate(
  mapping: DiffLineMapping,
  anchor: CursorAnchor | null
): { line: number; landing: Landing } {
  if (!anchor) return { line: 0, landing: "top" }

  let firstRow = -1
  let nearest = -1
  let nearestDistance = Infinity

  const lines = mapping.allLines
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (line.filename !== anchor.filename) continue
    if (firstRow === -1) firstRow = i
    if (anchor.lineNum === undefined) continue

    const side = sideOf(line.type)
    const lineNum = side === "LEFT" ? line.oldLineNum : line.newLineNum
    if (lineNum === undefined) continue
    if (lineNum === anchor.lineNum && side === anchor.side) return { line: i, landing: "exact" }

    const distance = Math.abs(lineNum - anchor.lineNum)
    if (distance < nearestDistance) {
      nearestDistance = distance
      nearest = i
    }
  }

  if (firstRow === -1) return { line: 0, landing: "top" }
  if (anchor.lineNum === undefined) return { line: firstRow, landing: "exact" }
  if (nearest !== -1) return { line: nearest, landing: "nearby" }
  return { line: firstRow, landing: "file" }
}

/**
 * What to say once the refresh has landed. "Your line moved" and "the branch
 * was rewritten" deserve different reactions, so both get named.
 */
export function refreshMessage(
  landing: Landing,
  anchor: CursorAnchor | null,
  forcePushed: boolean
): { message: string; type: "success" | "info" } {
  const where = anchor?.filename ?? "the diff"
  const line = anchor?.lineNum

  const moved =
    landing === "nearby"
      ? `line ${line} of ${where} is gone — landed nearby`
      : landing === "file"
        ? `${where} no longer shows line ${line} — landed on the file`
        : landing === "top" && anchor
          ? `${where} is gone — back at the top`
          : null

  const clauses = [forcePushed ? "the branch was force-pushed" : null, moved].filter(
    (clause): clause is string => clause !== null
  )
  if (clauses.length === 0) return { message: "Refreshed", type: "success" }

  const message = clauses.join("; ")
  return { message: message.charAt(0).toUpperCase() + message.slice(1), type: "info" }
}

/**
 * Whether the head riff was looking at is no longer part of the PR — the
 * branch was rewritten under it. Only answerable while the commit list is
 * complete: a PR longer than the fetch limit is truncated, and every head
 * would look rewritten.
 */
export function wasForcePushed(
  previousHeadSha: string | undefined,
  commits: { sha: string }[],
  fetchLimit: number
): boolean {
  if (!previousHeadSha || commits.length === 0 || commits.length >= fetchLimit) return false
  // Commits carry short SHAs, the head a full one.
  return !commits.some((commit) => previousHeadSha.startsWith(commit.sha))
}

function sideOf(type: string): "LEFT" | "RIGHT" {
  return type === "deletion" ? "LEFT" : "RIGHT"
}
