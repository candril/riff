import type { DiffFile } from "./diff-parser"

/**
 * Represents a node in the file tree
 */
export interface FileTreeNode {
  name: string // Display name (may include merged path like "foo/bar")
  path: string // Full path
  isDirectory: boolean
  children: FileTreeNode[]
  file?: DiffFile // Present if this is a file node
  expanded: boolean // For directories
  depth: number // Nesting level for rendering
}

/**
 * Flattened tree item for rendering and navigation
 */
export interface FlatTreeItem {
  node: FileTreeNode
  depth: number
  index: number // Index in flat list
  fileIndex?: number // Index in files array (for file nodes)
}

/**
 * Build a file tree from a list of diff files
 * Merges single-child directories (e.g., foo/bar/ becomes one node)
 */
export function buildFileTree(files: DiffFile[]): FileTreeNode[] {
  if (files.length === 0) {
    return []
  }

  // Build initial tree structure using a nested map
  interface TreeBuilder {
    children: Map<string, TreeBuilder>
    file?: DiffFile
  }

  const root: TreeBuilder = { children: new Map() }

  for (const file of files) {
    const parts = file.filename.split("/")
    let current = root

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      if (!part) continue
      
      const isFile = i === parts.length - 1

      if (!current.children.has(part)) {
        current.children.set(part, { children: new Map() })
      }

      const child = current.children.get(part)
      if (!child) continue

      if (isFile) {
        child.file = file
      } else {
        current = child
      }
    }
  }

  // Convert to FileTreeNode structure
  function convertToNodes(builder: TreeBuilder, path: string, depth: number): FileTreeNode[] {
    const nodes: FileTreeNode[] = []

    for (const [name, child] of builder.children) {
      const nodePath = path ? `${path}/${name}` : name
      const isDirectory = !child.file
      const children = isDirectory ? convertToNodes(child, nodePath, depth + 1) : []

      nodes.push({
        name,
        path: nodePath,
        isDirectory,
        children,
        file: child.file,
        expanded: true,
        depth,
      })
    }

    // Sort: directories first, then alphabetically
    nodes.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1
      if (!a.isDirectory && b.isDirectory) return 1
      return a.name.localeCompare(b.name)
    })

    return nodes
  }

  const tree = convertToNodes(root, "", 0)

  // Collapse single-child directories
  return collapseSingleChildDirs(tree, 0)
}

/**
 * Collapse single-child directories into merged paths
 * e.g., foo/bar/baz/ where each has one child becomes "foo/bar/baz/"
 */
function collapseSingleChildDirs(nodes: FileTreeNode[], depth: number): FileTreeNode[] {
  return nodes.map((node) => {
    if (!node.isDirectory) {
      return { ...node, depth }
    }

    // Process children first
    let children = collapseSingleChildDirs(node.children, depth + 1)
    let name = node.name
    let path = node.path

    // Merge while we have exactly one child that is a directory
    while (children.length === 1) {
      const child = children[0]
      if (!child || !child.isDirectory) break
      
      name = `${name}/${child.name}`
      path = child.path
      children = collapseSingleChildDirs(child.children, depth + 1)
    }

    return {
      ...node,
      name,
      path,
      children,
      depth,
    }
  })
}

/**
 * Flatten tree for rendering (respects expanded state)
 */
export function flattenTree(
  nodes: FileTreeNode[],
  files: DiffFile[],
  depth = 0
): FlatTreeItem[] {
  const result: FlatTreeItem[] = []

  for (const node of nodes) {
    const idx = node.file ? files.indexOf(node.file) : -1
    const fileIndex = idx >= 0 ? idx : undefined

    result.push({
      node,
      depth,
      index: result.length,
      fileIndex,
    })

    if (node.isDirectory && node.expanded && node.children.length > 0) {
      const childItems = flattenTree(node.children, files, depth + 1)
      result.push(...childItems)
    }
  }

  // Fix indices after building
  result.forEach((item, i) => {
    item.index = i
  })

  return result
}

/**
 * Toggle expansion of a directory node
 */
export function toggleNodeExpansion(
  nodes: FileTreeNode[],
  path: string
): FileTreeNode[] {
  return nodes.map((node) => {
    if (node.path === path && node.isDirectory) {
      return { ...node, expanded: !node.expanded }
    }
    if (node.isDirectory && node.children.length > 0) {
      return { ...node, children: toggleNodeExpansion(node.children, path) }
    }
    return node
  })
}

/**
 * Find file node by filename
 */
export function findFileNode(
  nodes: FileTreeNode[],
  filename: string
): FileTreeNode | undefined {
  for (const node of nodes) {
    if (!node.isDirectory && node.file?.filename === filename) {
      return node
    }
    if (node.isDirectory && node.children.length > 0) {
      const found = findFileNode(node.children, filename)
      if (found) return found
    }
  }
  return undefined
}
