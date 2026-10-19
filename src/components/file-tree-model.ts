import type { DiffFile } from "../utils/diff-parser"
import type { FileTreeNode, FlatTreeItem } from "../utils/file-tree"
import type { FileReviewStatus } from "../types"
import { flattenTree, filterTree } from "../utils/file-tree"
import { colors, theme } from "../theme"
import { flashLabelCell } from "../vim-diff/flash-state"

export interface FileTreeModelInput {
  files: DiffFile[]
  fileTree: FileTreeNode[]
  /** The navigation cursor, as a flat row index. */
  highlightIndex: number
  /** The file that scopes the views; null is all files. */
  selectedFileIndex: number | null
  focused: boolean
  fileStatuses: ReadonlyMap<string, FileReviewStatus>
  ignoredFiles: ReadonlySet<string>
  showHiddenFiles: boolean
  /** Filenames inside the V-mode range; empty when none is active. */
  multiSelectedFilenames: ReadonlySet<string>
  treeFilter: string
  /** Whether the `/` prompt is open and typing into the header row. */
  treeFilterInput: boolean
  /** Flash labels by flat row index, while `s` is labelling (spec 066). */
  flashLabels: ReadonlyMap<string, string>
  /** Files carrying a comment that arrived since your last visit (spec 069). */
  unseenFiles: ReadonlySet<string>
  /** And the ones whose content moved since then. */
  changedSinceVisit: ReadonlySet<string>
  width: number
}

export interface FileTreeCell {
  text: string
  fg: string
}

export interface FileTreeRow {
  /** The node's path: the same row keeps its key when the rows around it come or go. */
  key: string
  /** The flat index the row's ids and flash label go by. */
  index: number
  bg: string | null
  marker: FileTreeCell
  status: FileTreeCell
  name: FileTreeCell
}

export interface FileTreeModel {
  header: FileTreeCell & { filtering: boolean }
  rows: FileTreeRow[]
  hidden: string | null
  /** The visible flat items the rows come from, for the cursor and scrolling. */
  items: FlatTreeItem[]
}

export function fileTreeModel(input: FileTreeModelInput): FileTreeModel {
  const items = visibleTreeItems(
    input.fileTree,
    input.files,
    input.ignoredFiles,
    input.showHiddenFiles,
    input.treeFilter
  )
  const rows: FileTreeRow[] = []
  for (const item of items) {
    if (!item.node.name) continue
    rows.push(treeRow(item, input))
  }
  const hiddenCount = input.ignoredFiles.size
  return {
    header: treeHeader(input),
    rows,
    hidden: hiddenCount > 0 && !input.showHiddenFiles ? `(+${hiddenCount} hidden)` : null,
    items,
  }
}

function treeHeader(input: FileTreeModelInput): FileTreeModel["header"] {
  const { total, reviewed } = reviewProgress(input.files, input.fileStatuses, input.ignoredFiles)
  const progressText = total > 0 ? ` (${reviewed}/${total})` : ""
  // While filtering, the header is the prompt: the panel is narrow, and a
  // separate input row would cost a file row.
  return {
    text: input.treeFilter ? `/${input.treeFilter}` : `Files${progressText}`,
    fg: input.treeFilter ? colors.secondary : input.focused ? colors.primary : colors.textMuted,
    filtering: input.treeFilterInput,
  }
}

/** Ignored files count toward neither side: hiding them shouldn't leave the review looking unfinished. */
function reviewProgress(
  files: readonly DiffFile[],
  statuses: ReadonlyMap<string, FileReviewStatus>,
  ignoredFiles: ReadonlySet<string>
): { total: number; reviewed: number } {
  let total = 0
  let reviewed = 0
  for (const file of files) {
    if (ignoredFiles.has(file.filename)) continue
    total++
    if (statuses.get(file.filename)?.viewed) reviewed++
  }
  return { total, reviewed }
}

function treeRow(item: FlatTreeItem, input: FileTreeModelInput): FileTreeRow {
  const { node, depth, index } = item
  const isHighlighted = index === input.highlightIndex && input.focused
  // Unfocused, the highlight is still where the diff cursor is. It marks the
  // file you are in rather than drawing the cursor, so the tree answers which
  // file you are reading without claiming focus.
  const isSelected =
    item.fileIndex === input.selectedFileIndex ||
    (!input.focused && index === input.highlightIndex && item.fileIndex !== undefined)
  const isMultiSelected = !!node.file && input.multiSelectedFilenames.has(node.file.filename)

  const { viewed, stale, partlyViewed } = viewedState(node, input.files, input.fileStatuses)

  const indent = "  ".repeat(depth)
  const icon = node.isDirectory ? (node.expanded ? "▼ " : "▶ ") : "  "

  // The panel has one shade for "selected", and the cursor owns it, so the
  // file you are in is told apart by its name's colour instead.
  const nameFg = isSelected
    ? colors.primary
    : viewed
      ? colors.fileViewed
      : node.isDirectory
        ? theme.subtext0
        : node.file
          ? getStatusColor(node.file.status)
          : colors.text

  // ✓ viewed (stale when it changed since), ◐ a directory partly viewed, ○ not viewed.
  const marker: FileTreeCell = viewed
    ? { text: "✓ ", fg: stale ? colors.viewedStale : colors.viewedOk }
    : partlyViewed
      ? { text: "◐ ", fg: stale ? colors.viewedStale : colors.viewedNone }
      : { text: "○ ", fg: colors.viewedNone }
  const flashLabel = input.flashLabels.get(String(index))

  // marker, space, status, space, then the panel's padding, scrollbar and margin.
  const prefixLen = 4 + indent.length + icon.length
  const reserved = 4
  const displayName = truncate(node.name, Math.max(5, input.width - prefixLen - reserved))

  // Two marks for "since you last looked": a dot for something said here, a
  // caret for content that moved (spec 069).
  const marksNode = (names: ReadonlySet<string>): boolean =>
    node.file
      ? names.has(node.file.filename)
      : [...names].some((name) => name.startsWith(node.path + "/"))
  const unseen = marksNode(input.unseenFiles)
  const moved = marksNode(input.changedSinceVisit)

  return {
    key: node.path,
    index,
    // Three shades only: the cursor and the V-range are both "selected", so
    // they share surface0; everything else shows the panel's mantle.
    bg: isHighlighted || isMultiSelected ? theme.surface0 : null,
    marker: flashLabel !== undefined ? { text: flashLabelCell(flashLabel), fg: colors.flashLabel } : marker,
    status: {
      text: `${node.file ? getStatusIndicator(node.file.status) : " "} `,
      fg: viewed ? colors.fileViewed : node.file ? getStatusColor(node.file.status) : colors.text,
    },
    name: {
      text: `${indent}${icon}${displayName}${unseen ? " ●" : ""}${moved ? " ▴" : ""}`,
      fg: unseen && !node.isDirectory ? colors.commentLocal : nameFg,
    },
  }
}

/** A directory is viewed when every file under it is, and stale when any viewed one is. */
function viewedState(
  node: FileTreeNode,
  files: readonly DiffFile[],
  statuses: ReadonlyMap<string, FileReviewStatus>
): { viewed: boolean; stale: boolean; partlyViewed: boolean } {
  if (node.isDirectory) {
    const dir = computeDirViewedStatus(node.path, files, statuses)
    return { viewed: dir.allViewed, stale: dir.anyStale, partlyViewed: dir.anyViewed && !dir.allViewed }
  }
  const status = node.file ? statuses.get(node.file.filename) : undefined
  return { viewed: status?.viewed ?? false, stale: status?.isStale ?? false, partlyViewed: false }
}

export function getStatusColor(status: DiffFile["status"]): string {
  switch (status) {
    case "added":
      return colors.fileAdded
    case "modified":
      return colors.fileModified
    case "deleted":
      return colors.fileDeleted
    case "renamed":
      return colors.fileRenamed
    case "unchanged":
      return colors.text
  }
}

export function getStatusIndicator(status: DiffFile["status"]): string {
  switch (status) {
    case "added":
      return "A"
    case "modified":
      return "M"
    case "deleted":
      return "D"
    case "renamed":
      return "R"
    // Nothing changed, so there is no letter for what changed (spec 084).
    case "unchanged":
      return " "
  }
}

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  if (maxLen <= 3) return str.slice(0, maxLen)
  return str.slice(0, maxLen - 1) + "…"
}

interface DirViewedStatus {
  allViewed: boolean
  anyViewed: boolean
  anyStale: boolean
  totalFiles: number
  viewedFiles: number
}

/**
 * Matched by prefix rather than by walking the node's children, so a merged
 * directory like "src/components" covers "src/components/Header.ts".
 */
export function computeDirViewedStatus(
  dirPath: string,
  files: readonly DiffFile[],
  statuses: ReadonlyMap<string, FileReviewStatus>
): DirViewedStatus {
  const prefix = dirPath + "/"
  return computeDirViewedStatusForFiles(files.filter((f) => f.filename.startsWith(prefix)), statuses)
}

function computeDirViewedStatusForFiles(
  filesInDir: readonly DiffFile[],
  statuses: ReadonlyMap<string, FileReviewStatus>
): DirViewedStatus {
  let viewedCount = 0
  let staleCount = 0
  for (const file of filesInDir) {
    const status = statuses.get(file.filename)
    if (status?.viewed) {
      viewedCount++
      if (status.isStale) staleCount++
    }
  }
  return {
    allViewed: filesInDir.length > 0 && viewedCount === filesInDir.length,
    anyViewed: viewedCount > 0,
    anyStale: staleCount > 0,
    totalFiles: filesInDir.length,
    viewedFiles: viewedCount,
  }
}

/**
 * The rows the tree shows: narrowed by the path filter, minus ignored files
 * and the directories left empty by dropping them. Navigation and drawing
 * both go through here, so the cursor's index always names the row on screen.
 */
export function visibleTreeItems(
  fileTree: FileTreeNode[],
  files: DiffFile[],
  ignoredFiles: ReadonlySet<string>,
  showHiddenFiles: boolean,
  treeFilter = ""
): FlatTreeItem[] {
  const flatItems = flattenTree(filterTree(fileTree, treeFilter), files)
  if (showHiddenFiles || ignoredFiles.size === 0) return flatItems

  const shown = removeEmptyDirs(
    flatItems.filter(
      (item) => item.node.isDirectory || !(item.node.file && ignoredFiles.has(item.node.file.filename))
    ),
    files,
    ignoredFiles
  )
  shown.forEach((item, i) => {
    item.index = i
  })
  return shown
}

/** A directory is empty here when every file under it is ignored. */
export function removeEmptyDirs(
  flatItems: FlatTreeItem[],
  files: readonly DiffFile[],
  ignoredFiles: ReadonlySet<string>
): FlatTreeItem[] {
  return flatItems.filter((item) => {
    if (!item.node.isDirectory) return true
    const dirPrefix = item.node.path + "/"
    return files.some((f) => f.filename.startsWith(dirPrefix) && !ignoredFiles.has(f.filename))
  })
}
