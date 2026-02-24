import { Box, Text, ScrollBox } from "@opentui/core"
import type { DiffFile } from "../utils/diff-parser"
import type { FileTreeNode, FlatTreeItem } from "../utils/file-tree"
import { flattenTree } from "../utils/file-tree"
import { colors, theme } from "../theme"

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
 * Render a single tree item
 */
function renderTreeItem(
  item: FlatTreeItem,
  isSelected: boolean,
  isCurrent: boolean
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

  // Determine colors
  const nameFg = isCurrent
    ? colors.primary
    : node.isDirectory
      ? theme.subtext0
      : colors.text

  const bgColor = isSelected ? colors.selection : undefined

  return Box(
    {
      height: 1,
      width: "100%",
      backgroundColor: bgColor,
    },
    Text({
      content: `${indent}${icon}${node.name}`,
      fg: nameFg,
    }),
    status
      ? Text({
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
          flexDirection: "column",
          width: "100%",
        },
        ...flatItems.map((item, index) => {
          const isSelected = index === selectedIndex && focused
          const isCurrent = item.fileIndex === currentFileIndex
          return renderTreeItem(item, isSelected, isCurrent)
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
