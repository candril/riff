/**
 * Class-based FileTree panel that updates in place without recreating the ScrollBox.
 * This prevents flickering when navigating with j/k.
 */

import {
  BoxRenderable,
  TextRenderable,
  ScrollBoxRenderable,
  type CliRenderer,
  type Renderable,
} from "@opentui/core"
import type { DiffFile } from "../utils/diff-parser"
import type { FileTreeNode, FlatTreeItem } from "../utils/file-tree"
import type { FileReviewStatus } from "../types"
import { flattenTree } from "../utils/file-tree"
import { colors, theme } from "../theme"

export interface FileTreePanelOptions {
  renderer: CliRenderer
  width?: number
}

/**
 * Get color for file status (no character indicator - color is enough)
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

export class FileTreePanel {
  private renderer: CliRenderer
  private container: BoxRenderable
  private headerText: TextRenderable
  private scrollBox: ScrollBoxRenderable
  private content: BoxRenderable
  private itemRenderables: Map<string, { box: BoxRenderable; text: TextRenderable; markerText: TextRenderable }> = new Map()
  private width: number

  // Current state
  private currentFiles: DiffFile[] = []
  private currentFileTree: FileTreeNode[] = []
  private currentFileStatuses: Map<string, FileReviewStatus> = new Map()
  private currentCollapsedFiles: Set<string> = new Set()
  private highlightIndex: number = 0      // Navigation highlight
  private selectedFileIndex: number | null = null  // Actual selection (scopes views)
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
    })
    this.headerText = new TextRenderable(this.renderer, {
      content: "Files (0)",
      fg: colors.textMuted,
    })
    header.add(this.headerText)
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
   */
  update(
    files: DiffFile[],
    fileTree: FileTreeNode[],
    highlightIndex: number,
    selectedFileIndex: number | null,
    focused: boolean,
    fileStatuses?: Map<string, FileReviewStatus>,
    collapsedFiles?: Set<string>
  ): void {
    const structureChanged = 
      files !== this.currentFiles || 
      fileTree !== this.currentFileTree

    this.currentFiles = files
    this.currentFileTree = fileTree
    this.currentFileStatuses = fileStatuses ?? new Map()
    this.currentCollapsedFiles = collapsedFiles ?? new Set()
    this.highlightIndex = highlightIndex
    this.selectedFileIndex = selectedFileIndex
    this.focused = focused

    // Calculate review progress
    const total = files.length
    let reviewed = 0
    for (const file of files) {
      if (this.currentFileStatuses.get(file.filename)?.viewed) {
        reviewed++
      }
    }

    // Update header with progress
    const progressText = total > 0 ? ` (${reviewed}/${total})` : ""
    const scopeText = `Files${progressText}`
    this.headerText.content = scopeText
    this.headerText.fg = focused ? colors.primary : colors.textMuted
    this.container.borderColor = focused ? colors.primary : colors.border

    // Get flat items
    const flatItems = flattenTree(fileTree, files)

    if (structureChanged) {
      // Rebuild all items
      this.rebuildItems(flatItems)
    } else {
      // Just update styles (selection, current file highlighting)
      this.updateItemStyles(flatItems)
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
      const isSelected = item.fileIndex === this.selectedFileIndex
      
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

      // Background: highlight for keyboard nav, subtle for selected file
      const bgColor = isHighlighted 
        ? colors.selection 
        : isSelected 
          ? theme.surface0  // Subtle background for current file
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

      // Calculate available width for name
      // Account for: marker (1) + space (1) + indent + icon (2) + border (2) + scrollbar (1) + padding (1)
      const prefixLen = 2 + indent.length + icon.length
      const reserved = 4  // border + scrollbar + margin
      const availableWidth = Math.max(5, this.width - prefixLen - reserved)
      const displayName = truncate(node.name, availableWidth)

      // Create single text with marker, indent, icon, and name
      // Use index for ID to avoid issues with special chars in paths
      const markerText = new TextRenderable(this.renderer, {
        id: `tree-item-marker-${index}`,
        content: marker,
        fg: markerColor,
      })
      box.add(markerText)

      // Create text for indent, icon, and name (with leading space for separation)
      const text = new TextRenderable(this.renderer, {
        id: `tree-item-text-${index}`,
        content: ` ${indent}${icon}${displayName}`,
        fg: nameFg,
      })
      box.add(text)

      this.content.add(box)
      this.itemRenderables.set(String(index), { box, text, markerText })
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
      const isSelected = item.fileIndex === this.selectedFileIndex

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

      // Background: highlight for keyboard nav, subtle for selected file
      const bgColor = isHighlighted 
        ? colors.selection 
        : isSelected 
          ? theme.surface0  // Subtle background for current file
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

      // Calculate available width for name
      const prefixLen = 2 + indent.length + icon.length
      const reserved = 4
      const availableWidth = Math.max(5, this.width - prefixLen - reserved)
      const displayName = truncate(node.name, availableWidth)

      // Update properties
      renderables.box.backgroundColor = bgColor ?? undefined
      renderables.markerText.content = marker
      renderables.markerText.fg = markerColor
      renderables.text.content = ` ${indent}${icon}${displayName}`
      renderables.text.fg = nameFg
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
}
