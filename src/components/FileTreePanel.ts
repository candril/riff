/**
 * Class-based FileTree panel that updates in place without recreating the ScrollBox.
 * This prevents flickering when navigating with j/k.
 */

import {
  InputRenderable,
  InputRenderableEvents,
  BoxRenderable,
  TextRenderable,
  ScrollBoxRenderable,
  type CliRenderer,
  type Renderable,
} from "@opentui/core"
import type { DiffFile } from "../utils/diff-parser"
import type { FileTreeNode, FlatTreeItem } from "../utils/file-tree"
import type { FileReviewStatus } from "../types"
import { flattenTree, filterTree } from "../utils/file-tree"
import { colors, theme } from "../theme"

export interface FileTreePanelOptions {
  renderer: CliRenderer
  width?: number
}

/**
 * Get color for file status
 */
function getStatusColor(status: DiffFile["status"]): string {
  switch (status) {
    case "added":
      return colors.fileAdded
    case "modified":
      return colors.fileModified
    case "deleted":
      return colors.fileDeleted
    case "renamed":
      return colors.fileRenamed
  }
}

/**
 * Get status indicator character for a file (A/M/D/R)
 */
function getStatusIndicator(status: DiffFile["status"]): string {
  switch (status) {
    case "added":
      return "A"
    case "modified":
      return "M"
    case "deleted":
      return "D"
    case "renamed":
      return "R"
  }
}

/**
 * Truncate a string to fit within maxLen, adding ellipsis if needed
 */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  if (maxLen <= 3) return str.slice(0, maxLen)
  return str.slice(0, maxLen - 1) + "…"
}

/**
 * Directory viewed status - aggregates status of all files under a directory
 */
interface DirViewedStatus {
  allViewed: boolean      // All files in dir are viewed
  anyViewed: boolean      // At least one file is viewed
  anyStale: boolean       // At least one viewed file is stale
  totalFiles: number      // Total files under this dir
  viewedFiles: number     // Number of viewed files
}

/**
 * Compute viewed status for a directory based on all files under it.
 * Handles merged directory paths like "src/components" where files are
 * "src/components/Header.ts" etc.
 */
function computeDirViewedStatus(
  dirPath: string,
  files: DiffFile[],
  statuses: Map<string, FileReviewStatus>
): DirViewedStatus {
  // Files under this directory start with "dirPath/"
  const prefix = dirPath + "/"
  
  // Find all files that are under this directory
  const filesInDir = files.filter(f => f.filename.startsWith(prefix))
  
  return computeDirViewedStatusForFiles(filesInDir, statuses)
}

/**
 * Helper to compute viewed status from a list of files
 */
function computeDirViewedStatusForFiles(
  filesInDir: DiffFile[],
  statuses: Map<string, FileReviewStatus>
): DirViewedStatus {
  let viewedCount = 0
  let staleCount = 0
  
  for (const file of filesInDir) {
    const status = statuses.get(file.filename)
    if (status?.viewed) {
      viewedCount++
      if (status.isStale) {
        staleCount++
      }
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
 * Remove directory items from flattened tree that have no visible (non-ignored) file children.
 * A directory is "empty" if all its descendant files are ignored.
 */
function removeEmptyDirs(
  flatItems: FlatTreeItem[],
  files: DiffFile[],
  ignoredFiles: Set<string>
): FlatTreeItem[] {
  // For each directory node, check if it has any non-ignored files under it
  return flatItems.filter(item => {
    if (!item.node.isDirectory) return true
    
    // Check if any file under this directory path is not ignored
    const dirPrefix = item.node.path + "/"
    return files.some(f => f.filename.startsWith(dirPrefix) && !ignoredFiles.has(f.filename))
  })
}

export class FileTreePanel {
  private renderer: CliRenderer
  private container: BoxRenderable
  private headerText: TextRenderable
  /**
   * The `/` filter box. A real OpenTUI input rather than a hand-rolled
   * prompt, so Ctrl-w, word jumps, paste, undo and selection all behave the
   * way they do in every other text field.
   */
  private header: BoxRenderable
  /** The `/` shown beside the filter box, so typing reads like the label. */
  private filterPrefix: TextRenderable
  private filterInput: InputRenderable
  private filterFocused: boolean = false
  private onFilterChange: ((value: string) => void) | null = null
  private scrollBox: ScrollBoxRenderable
  private content: BoxRenderable
  private itemRenderables: Map<string, { 
    box: BoxRenderable
    text: TextRenderable
    markerText: TextRenderable
    statusText: TextRenderable 
  }> = new Map()
  private hiddenCountRenderable: { box: BoxRenderable; text: TextRenderable } | null = null
  private width: number

  // Current state
  private currentFiles: DiffFile[] = []
  private currentFileTree: FileTreeNode[] = []
  private currentFileStatuses: Map<string, FileReviewStatus> = new Map()
  private currentCollapsedFiles: Set<string> = new Set()
  private currentIgnoredFiles: Set<string> = new Set()
  private currentShowHidden: boolean = false
  private currentFilter: string = ""
  /** Flash labels by flat row index, while `s` is labelling (spec 066). */
  private currentFlashLabels: ReadonlyMap<number, string> = new Map()
  private highlightIndex: number = 0      // Navigation highlight
  private selectedFileIndex: number | null = null  // Actual selection (scopes views)
  private multiSelectedFilenames: Set<string> = new Set()  // V-mode tree selection
  private focused: boolean = false

  constructor(options: FileTreePanelOptions) {
    this.renderer = options.renderer
    this.width = options.width ?? 35

    // Create container
    this.container = new BoxRenderable(this.renderer, {
      id: "file-tree-panel",
      width: this.width,
      height: "100%",
      flexDirection: "column",
      borderStyle: "single",
      borderColor: colors.border,
    })

    // Create header
    const header = new BoxRenderable(this.renderer, {
      height: 1,
      width: "100%",
      paddingLeft: 1,
      backgroundColor: theme.mantle,
      // The filter prompt puts a `/` beside the input box; without an
      // explicit direction they stack instead of sitting side by side.
      flexDirection: "row",
    })
    this.headerText = new TextRenderable(this.renderer, {
      id: "file-tree-header-text",
      content: "Files (0)",
      fg: colors.textMuted,
      // The header lays its children out in a row for the filter prompt;
      // a Text with no basis measures as zero wide there.
      flexGrow: 1,
    })
    this.header = header
    header.add(this.headerText)

    this.filterInput = new InputRenderable(this.renderer, {
      id: "file-tree-filter",
      placeholder: "filter by path…",
      placeholderColor: theme.overlay0,
      backgroundColor: theme.mantle,
      textColor: theme.text,
      focusedBackgroundColor: theme.mantle,
      focusedTextColor: theme.text,
      cursorColor: theme.yellow,
      flexGrow: 1,
      visible: false,
    })
    this.filterInput.on(InputRenderableEvents.INPUT, (value: string) => {
      this.onFilterChange?.(value)
    })
    this.filterPrefix = new TextRenderable(this.renderer, {
      id: "file-tree-filter-prefix",
      content: "/",
      fg: colors.secondary,
    })

    this.container.add(header)

    // Create scroll box
    this.scrollBox = new ScrollBoxRenderable(this.renderer, {
      id: "file-tree-scroll",
      flexGrow: 1,
      width: "100%",
      scrollY: true,
      verticalScrollbarOptions: {
        showArrows: false,
        trackOptions: {
          backgroundColor: theme.surface0,
          foregroundColor: theme.surface2,
        },
      },
    })
    this.container.add(this.scrollBox)

    // Create content container inside scroll box
    this.content = new BoxRenderable(this.renderer, {
      id: "file-tree-content",
      flexDirection: "column",
      width: "100%",
    })
    this.scrollBox.add(this.content)
  }

  /**
   * Where the filter box sends what the user types. Set from app.ts, which
   * owns the state the tree is filtered from.
   */
  setOnFilterChange(callback: (value: string) => void): void {
    this.onFilterChange = callback
  }

  /**
   * Swap the header row between its label and the `/` input. They share one
   * row, so mounting both leaves them fighting for the width and neither
   * reads. Focus is taken only on the way in, so a re-render mid-typing
   * doesn't reset the cursor, and the value is seeded from state — `/` on an
   * applied filter refines it rather than starting over.
   */
  private syncFilterInput(treeFilter: string, treeFilterInput: boolean): void {
    if (treeFilterInput === this.filterFocused) return
    this.filterFocused = treeFilterInput

    if (treeFilterInput) {
      this.header.remove(this.headerText.id)
      this.filterPrefix.visible = true
      this.filterInput.visible = true
      this.header.add(this.filterPrefix)
      this.header.add(this.filterInput)
      this.filterInput.value = treeFilter
      this.filterInput.focus()
    } else {
      this.filterInput.blur()
      this.header.remove(this.filterPrefix.id)
      this.header.remove(this.filterInput.id)
      this.filterPrefix.visible = false
      this.filterInput.visible = false
      this.header.add(this.headerText)
    }
  }

  getContainer(): BoxRenderable {
    return this.container
  }

  getScrollBox(): ScrollBoxRenderable {
    return this.scrollBox
  }

  /**
   * Update the file tree with new state.
   * Only recreates item renderables if the tree structure changed.
   *
   * @param highlightIndex - Which item is highlighted (navigation cursor)
   * @param selectedFileIndex - Which file is selected (scopes views), null = all files
   * @param fileStatuses - Map of file viewed/reviewed statuses
   * @param collapsedFiles - Set of filenames that are collapsed in diff view
   * @param ignoredFiles - Set of filenames that match ignore patterns
   * @param showHiddenFiles - Whether to show ignored files in the tree
   * @param multiSelectedFilenames - Filenames currently inside the V-mode
   *                                 tree multi-select range. Empty = no
   *                                 multi-select active.
   */
  update(
    files: DiffFile[],
    fileTree: FileTreeNode[],
    highlightIndex: number,
    selectedFileIndex: number | null,
    focused: boolean,
    fileStatuses?: Map<string, FileReviewStatus>,
    collapsedFiles?: Set<string>,
    ignoredFiles?: Set<string>,
    showHiddenFiles?: boolean,
    multiSelectedFilenames?: Set<string>,
    treeFilter = "",
    treeFilterInput = false,
    flashLabels: ReadonlyMap<number, string> = new Map()
  ): void {
    this.currentFlashLabels = flashLabels
    const newIgnored = ignoredFiles ?? new Set<string>()
    const newShowHidden = showHiddenFiles ?? false
    const newMulti = multiSelectedFilenames ?? new Set<string>()

    const structureChanged =
      files !== this.currentFiles ||
      fileTree !== this.currentFileTree ||
      newIgnored !== this.currentIgnoredFiles ||
      newShowHidden !== this.currentShowHidden ||
      treeFilter !== this.currentFilter

    this.currentFiles = files
    this.currentFileTree = fileTree
    this.currentFileStatuses = fileStatuses ?? new Map()
    this.currentCollapsedFiles = collapsedFiles ?? new Set()
    this.currentIgnoredFiles = newIgnored
    this.currentShowHidden = newShowHidden
    this.currentFilter = treeFilter
    this.multiSelectedFilenames = newMulti
    this.highlightIndex = highlightIndex
    this.selectedFileIndex = selectedFileIndex
    this.focused = focused

    // Calculate review progress (exclude ignored files)
    let total = 0
    let reviewed = 0
    for (const file of files) {
      if (newIgnored.has(file.filename)) continue
      total++
      if (this.currentFileStatuses.get(file.filename)?.viewed) {
        reviewed++
      }
    }

    const hiddenCount = newIgnored.size

    // Update header with progress. While filtering, the header is the prompt:
    // the panel is narrow, and a separate input row would cost a file row.
    const progressText = total > 0 ? ` (${reviewed}/${total})` : ""
    this.headerText.content = treeFilter ? `/${treeFilter}` : `Files${progressText}`
    this.headerText.fg = treeFilter
      ? colors.secondary
      : focused
        ? colors.primary
        : colors.textMuted
    this.syncFilterInput(treeFilter, treeFilterInput)
    this.container.borderColor = focused ? colors.primary : colors.border

    const flatItems = this.visibleItems()

    if (structureChanged) {
      // Rebuild all items
      this.rebuildItems(flatItems)
      this.updateHiddenCount(hiddenCount, newShowHidden)
    } else {
      // Just update styles (selection, current file highlighting)
      this.updateItemStyles(flatItems)
      this.updateHiddenCount(hiddenCount, newShowHidden)
    }
  }

  /**
   * Rebuild all tree item renderables
   */
  private rebuildItems(flatItems: FlatTreeItem[]): void {
    // Remove old items
    for (const [id, item] of this.itemRenderables) {
      this.content.remove(item.box.id)
    }
    this.itemRenderables.clear()

    // Create new items
    for (let index = 0; index < flatItems.length; index++) {
      const item = flatItems[index]!
      const { node, depth } = item
      
      // Skip nodes with empty names (shouldn't happen, but defensive)
      if (!node.name) continue
      
      const isHighlighted = index === this.highlightIndex && this.focused
      // Unfocused, the highlight is still where the diff cursor is. It
      // shows as the "you are here" background rather than the cursor's,
      // so the tree answers which file you are in without claiming focus.
      const isSelected =
        item.fileIndex === this.selectedFileIndex ||
        (!this.focused && index === this.highlightIndex && item.fileIndex !== undefined)
      const isMultiSelected = !!node.file && this.multiSelectedFilenames.has(node.file.filename)

      // Compute viewed status - different for files vs directories
      let isViewed = false
      let isStale = false
      let isPartiallyViewed = false  // For directories: some but not all viewed

      if (node.isDirectory) {
        // Directory: aggregate status from all files under it
        const dirStatus = computeDirViewedStatus(node.path, this.currentFiles, this.currentFileStatuses)
        isViewed = dirStatus.allViewed
        isPartiallyViewed = dirStatus.anyViewed && !dirStatus.allViewed
        isStale = dirStatus.anyStale
      } else if (node.file) {
        // File: use direct status
        const viewedStatus = this.currentFileStatuses.get(node.file.filename)
        isViewed = viewedStatus?.viewed ?? false
        isStale = viewedStatus?.isStale ?? false
      }

      const indent = "  ".repeat(depth)
      const icon = node.isDirectory
        ? node.expanded ? "▼ " : "▶ "
        : "  "

      // Files get color based on status, directories get subtext color
      // Viewed files/dirs get dimmed color
      const nameFg = isViewed
        ? colors.fileViewed
        : node.isDirectory
          ? theme.subtext0
          : node.file
            ? getStatusColor(node.file.status)
            : colors.text

      // Background priority (darker → lighter):
      //   cursor highlight > multi-select range > the file you are in > none
      const bgColor = isHighlighted
        ? colors.selection                 // surface2 — cursor
        : isMultiSelected
          ? theme.surface1                 // V-mode range member
          : isSelected
            ? theme.surface0               // the file you are in (subtle)
            : undefined

      // Create box for this item
      // Use index for ID to avoid issues with special chars in paths
      const box = new BoxRenderable(this.renderer, {
        id: `tree-item-${index}`,
        height: 1,
        width: "100%",
        flexDirection: "row",
        backgroundColor: bgColor,
      })

      // Viewed marker with states:
      // ✓ green - all viewed, unchanged
      // ✓ orange - viewed, but modified since (or dir has stale files)
      // ◐ dim - partially viewed (directories only)
      // ○ dim - not viewed
      let marker: string
      let markerColor: string
      
      if (isViewed) {
        marker = "✓"
        markerColor = isStale ? colors.viewedStale : colors.viewedOk
      } else if (isPartiallyViewed) {
        marker = "◐"
        markerColor = isStale ? colors.viewedStale : colors.viewedNone
      } else {
        marker = "○"
        markerColor = colors.viewedNone
      }

      // Status indicator (A/M/D/R) for files, empty for directories
      // Dim the color when file is viewed
      const statusIndicator = node.file ? getStatusIndicator(node.file.status) : " "
      const statusColor = isViewed 
        ? colors.fileViewed 
        : (node.file ? getStatusColor(node.file.status) : colors.text)

      // Calculate available width for name
      // Account for: marker (1) + space (1) + status (1) + space (1) + indent + icon (2) + border (2) + scrollbar (1) + padding (1)
      const prefixLen = 4 + indent.length + icon.length
      const reserved = 4  // border + scrollbar + margin
      const availableWidth = Math.max(5, this.width - prefixLen - reserved)
      const displayName = truncate(node.name, availableWidth)

      // Column 1: Viewed marker with trailing space
      const markerText = new TextRenderable(this.renderer, {
        id: `tree-item-marker-${index}`,
        content: `${marker} `,
        fg: markerColor,
      })
      box.add(markerText)

      // Column 2: Status indicator (A/M/D/R) with trailing space
      const statusText = new TextRenderable(this.renderer, {
        id: `tree-item-status-${index}`,
        content: `${statusIndicator} `,
        fg: statusColor,
      })
      box.add(statusText)

      // Column 3: Indent, icon, and name
      const text = new TextRenderable(this.renderer, {
        id: `tree-item-text-${index}`,
        content: `${indent}${icon}${displayName}`,
        fg: nameFg,
      })
      box.add(text)

      this.content.add(box)
      this.itemRenderables.set(String(index), { box, text, markerText, statusText })
    }
  }

  /**
   * Update styles on existing items without recreating them
   */
  private updateItemStyles(flatItems: FlatTreeItem[]): void {
    for (let index = 0; index < flatItems.length; index++) {
      const item = flatItems[index]!
      const { node, depth } = item
      
      // Skip nodes with empty names
      if (!node.name) continue
      
      const isHighlighted = index === this.highlightIndex && this.focused
      // Unfocused, the highlight is still where the diff cursor is. It
      // shows as the "you are here" background rather than the cursor's,
      // so the tree answers which file you are in without claiming focus.
      const isSelected =
        item.fileIndex === this.selectedFileIndex ||
        (!this.focused && index === this.highlightIndex && item.fileIndex !== undefined)
      const isMultiSelected = !!node.file && this.multiSelectedFilenames.has(node.file.filename)

      const renderables = this.itemRenderables.get(String(index))
      if (!renderables) continue

      // Compute viewed status - different for files vs directories
      let isViewed = false
      let isStale = false
      let isPartiallyViewed = false  // For directories: some but not all viewed
      
      if (node.isDirectory) {
        // Directory: aggregate status from all files under it
        const dirStatus = computeDirViewedStatus(node.path, this.currentFiles, this.currentFileStatuses)
        isViewed = dirStatus.allViewed
        isPartiallyViewed = dirStatus.anyViewed && !dirStatus.allViewed
        isStale = dirStatus.anyStale
      } else if (node.file) {
        // File: use direct status
        const viewedStatus = this.currentFileStatuses.get(node.file.filename)
        isViewed = viewedStatus?.viewed ?? false
        isStale = viewedStatus?.isStale ?? false
      }

      const indent = "  ".repeat(depth)
      const icon = node.isDirectory
        ? node.expanded ? "▼ " : "▶ "
        : "  "

      // Files get color based on status, directories get subtext color
      // Viewed files/dirs get dimmed color
      const nameFg = isViewed
        ? colors.fileViewed
        : node.isDirectory
          ? theme.subtext0
          : node.file
            ? getStatusColor(node.file.status)
            : colors.text

      // Background priority (same as rebuildItems):
      //   cursor highlight > multi-select range > the file you are in > none
      const bgColor = isHighlighted
        ? colors.selection
        : isMultiSelected
          ? theme.surface1
          : isSelected
            ? theme.surface0
            : null

      // Viewed marker with states:
      // ✓ green - all viewed, unchanged
      // ✓ orange - viewed, but modified since (or dir has stale files)
      // ◐ dim - partially viewed (directories only)
      // ○ dim - not viewed
      let marker: string
      let markerColor: string
      
      if (isViewed) {
        marker = "✓"
        markerColor = isStale ? colors.viewedStale : colors.viewedOk
      } else if (isPartiallyViewed) {
        marker = "◐"
        markerColor = isStale ? colors.viewedStale : colors.viewedNone
      } else {
        marker = "○"
        markerColor = colors.viewedNone
      }

      // Status indicator (A/M/D/R) for files, empty for directories
      // Dim the color when file is viewed
      const statusIndicator = node.file ? getStatusIndicator(node.file.status) : " "
      const statusColor = isViewed 
        ? colors.fileViewed 
        : (node.file ? getStatusColor(node.file.status) : colors.text)

      // Calculate available width for name
      // Account for: marker (1) + space (1) + status (1) + space (1) + indent + icon (2) + border (2) + scrollbar (1) + padding (1)
      const prefixLen = 4 + indent.length + icon.length
      const reserved = 4
      const availableWidth = Math.max(5, this.width - prefixLen - reserved)
      const displayName = truncate(node.name, availableWidth)

      // Update properties
      const flashLabel = this.currentFlashLabels.get(index)
      renderables.box.backgroundColor = bgColor ?? undefined
      renderables.markerText.content = flashLabel ? `${flashLabel} ` : `${marker} `
      renderables.markerText.fg = flashLabel ? colors.flashLabel : markerColor
      renderables.statusText.content = `${statusIndicator} `
      renderables.statusText.fg = statusColor
      renderables.text.content = `${indent}${icon}${displayName}`
      renderables.text.fg = nameFg
    }
  }

  /**
   * Update the "(+N hidden)" indicator at the bottom of the tree
   */
  private updateHiddenCount(hiddenCount: number, showHidden: boolean): void {
    // Remove existing hidden count renderable if present
    if (this.hiddenCountRenderable) {
      this.content.remove(this.hiddenCountRenderable.box.id)
      this.hiddenCountRenderable = null
    }

    // Show hidden count indicator if there are hidden files and we're not showing them
    if (hiddenCount > 0 && !showHidden) {
      const box = new BoxRenderable(this.renderer, {
        id: "tree-hidden-count",
        height: 1,
        width: "100%",
        paddingLeft: 1,
      })
      const text = new TextRenderable(this.renderer, {
        id: "tree-hidden-count-text",
        content: `(+${hiddenCount} hidden)`,
        fg: colors.textMuted,
      })
      box.add(text)
      this.content.add(box)
      this.hiddenCountRenderable = { box, text }
    }
  }

  /**
   * Ensure the highlighted item is visible in the scroll box
   */
  ensureHighlightVisible(): void {
    const viewportHeight = Math.floor(this.scrollBox.height)
    const scrollTop = this.scrollBox.scrollTop
    
    if (this.highlightIndex < scrollTop) {
      this.scrollBox.scrollTop = this.highlightIndex
    } else if (this.highlightIndex >= scrollTop + viewportHeight) {
      this.scrollBox.scrollTop = this.highlightIndex - viewportHeight + 1
    }
  }

  show(): void {
    this.container.visible = true
  }

  hide(): void {
    this.container.visible = false
  }

  get visible(): boolean {
    return this.container.visible
  }

  set visible(value: boolean) {
    this.container.visible = value
  }

  /**
   * Get current width
   */
  getWidth(): number {
    return this.width
  }

  /**
   * Set the panel width and update the container
   */
  setWidth(width: number): void {
    if (this.width === width) return
    this.width = width
    this.container.width = width
    // Rebuild so the new width can re-truncate every label.
    this.rebuildItems(this.visibleItems())
  }

  /**
   * The rows the panel should be showing: the tree narrowed by the path
   * filter, minus ignored files and the directories left empty by dropping
   * them. Every rebuild goes through here — a rebuild that derived the list
   * differently (a width change used to skip the filter) left rows on screen
   * that the next style-only update had no reason to touch.
   */
  private visibleItems(): FlatTreeItem[] {
    let flatItems = flattenTree(
      filterTree(this.currentFileTree, this.currentFilter),
      this.currentFiles
    )
    if (this.currentShowHidden || this.currentIgnoredFiles.size === 0) return flatItems

    flatItems = flatItems.filter((item) => {
      // Keep directory nodes (they might contain non-ignored files)
      if (item.node.isDirectory) return true
      if (item.node.file && this.currentIgnoredFiles.has(item.node.file.filename)) return false
      return true
    })
    flatItems = removeEmptyDirs(flatItems, this.currentFiles, this.currentIgnoredFiles)
    flatItems.forEach((item, i) => { item.index = i })
    return flatItems
  }
}
