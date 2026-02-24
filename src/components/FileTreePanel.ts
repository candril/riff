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

export class FileTreePanel {
  private renderer: CliRenderer
  private container: BoxRenderable
  private headerText: TextRenderable
  private scrollBox: ScrollBoxRenderable
  private content: BoxRenderable
  private itemRenderables: Map<string, { box: BoxRenderable; text: TextRenderable }> = new Map()
  private width: number

  // Current state
  private currentFiles: DiffFile[] = []
  private currentFileTree: FileTreeNode[] = []
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
   */
  update(
    files: DiffFile[],
    fileTree: FileTreeNode[],
    highlightIndex: number,
    selectedFileIndex: number | null,
    focused: boolean
  ): void {
    const structureChanged = 
      files !== this.currentFiles || 
      fileTree !== this.currentFileTree

    this.currentFiles = files
    this.currentFileTree = fileTree
    this.highlightIndex = highlightIndex
    this.selectedFileIndex = selectedFileIndex
    this.focused = focused

    // Update header
    const scopeText = selectedFileIndex === null ? "All files" : `Files (${files.length})`
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

      const indent = "  ".repeat(depth)
      const icon = node.isDirectory
        ? node.expanded ? "▼ " : "▶ "
        : "  "

      // Files get color based on status, directories get subtext color
      // Selected file gets primary color
      const nameFg = isSelected
        ? colors.primary
        : node.isDirectory
          ? theme.subtext0
          : node.file
            ? getStatusColor(node.file.status)
            : colors.text

      // Highlighted item gets background
      const bgColor = isHighlighted ? colors.selection : undefined

      // Create box for this item
      const box = new BoxRenderable(this.renderer, {
        id: `tree-item-${node.path}`,
        height: 1,
        width: "100%",
        backgroundColor: bgColor,
      })

      // Selection marker (dot when selected)
      const marker = isSelected ? "●" : " "

      // Create text - just marker, indent, icon, and name
      // No separate status indicator - color coding is sufficient
      const text = new TextRenderable(this.renderer, {
        id: `tree-item-text-${node.path}`,
        content: `${marker}${indent}${icon}${node.name}`,
        fg: nameFg,
      })
      box.add(text)

      this.content.add(box)
      this.itemRenderables.set(node.path, { box, text })
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

      const renderables = this.itemRenderables.get(node.path)
      if (!renderables) continue

      const indent = "  ".repeat(depth)
      const icon = node.isDirectory
        ? node.expanded ? "▼ " : "▶ "
        : "  "

      // Files get color based on status, directories get subtext color
      // Selected file gets primary color
      const nameFg = isSelected
        ? colors.primary
        : node.isDirectory
          ? theme.subtext0
          : node.file
            ? getStatusColor(node.file.status)
            : colors.text

      const bgColor = isHighlighted ? colors.selection : null
      const marker = isSelected ? "●" : " "

      // Update properties
      renderables.box.backgroundColor = bgColor ?? undefined
      renderables.text.content = `${marker}${indent}${icon}${node.name}`
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
