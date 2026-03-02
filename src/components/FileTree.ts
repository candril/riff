import { Box, Text, ScrollBox } from "@opentui/core"
import type { DiffFile } from "../utils/diff-parser"
import type { FileTreeNode, FlatTreeItem } from "../utils/file-tree"
import { flattenTree } from "../utils/file-tree"
import { colors, theme } from "../theme"
import { getFileColor } from "../utils/file-colors"

export interface FileTreeProps {
  fileTree: FileTreeNode[]
  files: DiffFile[]
  currentFileIndex: number
  selectedIndex: number
  focused: boolean
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

/**
 * Truncate a string to fit within maxLen, adding ellipsis if needed
 */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  if (maxLen <= 3) return str.slice(0, maxLen)
  return str.slice(0, maxLen - 1) + "…"
}

/**
 * Render a single tree item
 */
function renderTreeItem(
  item: FlatTreeItem,
  isSelected: boolean,
  isCurrent: boolean,
  maxWidth: number
): ReturnType<typeof Box> {
  const { node, depth } = item
  const indent = "  ".repeat(depth)

  // Directory or file icon
  const icon = node.isDirectory
    ? node.expanded
      ? "▼ "
      : "▶ "
    : "  "

  // Status indicator for files
  const status = node.file ? getStatusIndicator(node.file.status) : null

  // Determine colors - use file type colors for files
  const fileColor = node.file ? getFileColor(node.name) : undefined
  const nameFg = isCurrent
    ? colors.primary
    : node.isDirectory
      ? theme.subtext0
      : fileColor || colors.text

  const bgColor = isSelected ? colors.selection : undefined

  // Calculate available space for name
  // Account for: indent + icon + status indicator (2 chars) + border (2 chars) + padding
  const prefixLen = indent.length + icon.length
  const suffixLen = status ? 2 : 0
  const padding = 4  // borders and some margin
  const availableWidth = Math.max(5, maxWidth - prefixLen - suffixLen - padding)
  const displayName = truncate(node.name, availableWidth)

  // Use stable id based on path for reconciliation
  return Box(
    {
      id: `tree-item-${node.path}`,
      height: 1,
      width: "100%",
      backgroundColor: bgColor,
    },
    Text({
      id: `tree-item-text-${node.path}`,
      content: `${indent}${icon}${displayName}`,
      fg: nameFg,
    }),
    status
      ? Text({
          id: `tree-item-status-${node.path}`,
          content: ` ${status.char}`,
          fg: status.color,
        })
      : null
  )
}

/**
 * File tree panel component
 */
export function FileTree({
  fileTree,
  files,
  currentFileIndex,
  selectedIndex,
  focused,
  width = 30,
}: FileTreeProps) {
  const flatItems = flattenTree(fileTree, files)
  const currentFile = files[currentFileIndex]

  return Box(
    {
      id: "file-tree-panel",
      width,
      height: "100%",
      flexDirection: "column",
      borderStyle: "single",
      borderColor: focused ? colors.primary : colors.border,
    },
    // Header
    Box(
      {
        height: 1,
        width: "100%",
        paddingLeft: 1,
        backgroundColor: theme.mantle,
      },
      Text({
        content: `Files (${files.length})`,
        fg: focused ? colors.primary : colors.textMuted,
      })
    ),
    // Tree content
    ScrollBox(
      {
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
      },
      Box(
        {
          id: "file-tree-content",
          flexDirection: "column",
          width: "100%",
        },
        ...flatItems.map((item, index) => {
          const isSelected = index === selectedIndex && focused
          const isCurrent = item.fileIndex === currentFileIndex
          return renderTreeItem(item, isSelected, isCurrent, width)
        })
      )
    )
  )
}

/**
 * Get flattened tree items (for keyboard navigation)
 */
export function getFlatTreeItems(
  fileTree: FileTreeNode[],
  files: DiffFile[]
): FlatTreeItem[] {
  return flattenTree(fileTree, files)
}

/**
 * Get a reference to the file tree scroll box for programmatic scrolling
 */
export function getFileTreeScrollBox(renderer: { root: { findDescendantById: (id: string) => unknown } }): import("@opentui/core").ScrollBoxRenderable | null {
  return renderer.root.findDescendantById("file-tree-scroll") as import("@opentui/core").ScrollBoxRenderable | null
}
