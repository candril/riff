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
 * Get status indicator for a file
 */
function getStatusIndicator(status: DiffFile["status"]): { char: string; color: string } {
  switch (status) {
    case "added":
      return { char: "A", color: colors.fileAdded }
    case "modified":
      return { char: "M", color: colors.fileModified }
    case "deleted":
      return { char: "D", color: colors.fileDeleted }
    case "renamed":
      return { char: "R", color: colors.fileRenamed }
  }
}

export class FileTreePanel {
  private renderer: CliRenderer
  private container: BoxRenderable
  private headerText: TextRenderable
  private scrollBox: ScrollBoxRenderable
  private content: BoxRenderable
  private itemRenderables: Map<string, { box: BoxRenderable; text: TextRenderable; status?: TextRenderable }> = new Map()
  private width: number

  // Current state
  private currentFiles: DiffFile[] = []
  private currentFileTree: FileTreeNode[] = []
  private currentFileIndex: number = 0
  private selectedIndex: number = 0
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
   */
  update(
    files: DiffFile[],
    fileTree: FileTreeNode[],
    currentFileIndex: number,
    selectedIndex: number,
    focused: boolean
  ): void {
    const structureChanged = 
      files !== this.currentFiles || 
      fileTree !== this.currentFileTree

    this.currentFiles = files
    this.currentFileTree = fileTree
    this.currentFileIndex = currentFileIndex
    this.selectedIndex = selectedIndex
    this.focused = focused

    // Update header
    this.headerText.content = `Files (${files.length})`
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
      const isSelected = index === this.selectedIndex && this.focused
      const isCurrent = item.fileIndex === this.currentFileIndex

      const indent = "  ".repeat(depth)
      const icon = node.isDirectory
        ? node.expanded ? "▼ " : "▶ "
        : "  "

      const nameFg = isCurrent
        ? colors.primary
        : node.isDirectory
          ? theme.subtext0
          : colors.text

      const bgColor = isSelected ? colors.selection : undefined

      // Create box for this item
      const box = new BoxRenderable(this.renderer, {
        id: `tree-item-${node.path}`,
        height: 1,
        width: "100%",
        backgroundColor: bgColor,
      })

      // Create text
      const text = new TextRenderable(this.renderer, {
        id: `tree-item-text-${node.path}`,
        content: `${indent}${icon}${node.name}`,
        fg: nameFg,
      })
      box.add(text)

      // Create status indicator if file
      let statusRenderable: TextRenderable | undefined
      if (node.file) {
        const status = getStatusIndicator(node.file.status)
        statusRenderable = new TextRenderable(this.renderer, {
          id: `tree-item-status-${node.path}`,
          content: ` ${status.char}`,
          fg: status.color,
        })
        box.add(statusRenderable)
      }

      this.content.add(box)
      this.itemRenderables.set(node.path, { box, text, status: statusRenderable })
    }
  }

  /**
   * Update styles on existing items without recreating them
   */
  private updateItemStyles(flatItems: FlatTreeItem[]): void {
    for (let index = 0; index < flatItems.length; index++) {
      const item = flatItems[index]!
      const { node, depth } = item
      const isSelected = index === this.selectedIndex && this.focused
      const isCurrent = item.fileIndex === this.currentFileIndex

      const renderables = this.itemRenderables.get(node.path)
      if (!renderables) continue

      const indent = "  ".repeat(depth)
      const icon = node.isDirectory
        ? node.expanded ? "▼ " : "▶ "
        : "  "

      const nameFg = isCurrent
        ? colors.primary
        : node.isDirectory
          ? theme.subtext0
          : colors.text

      const bgColor = isSelected ? colors.selection : null

      // Update properties
      renderables.box.backgroundColor = bgColor ?? undefined
      renderables.text.content = `${indent}${icon}${node.name}`
      renderables.text.fg = nameFg
    }
  }

  /**
   * Ensure the selected item is visible in the scroll box
   */
  ensureSelectedVisible(): void {
    const viewportHeight = Math.floor(this.scrollBox.height)
    const scrollTop = this.scrollBox.scrollTop
    
    if (this.selectedIndex < scrollTop) {
      this.scrollBox.scrollTop = this.selectedIndex
    } else if (this.selectedIndex >= scrollTop + viewportHeight) {
      this.scrollBox.scrollTop = this.selectedIndex - viewportHeight + 1
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
