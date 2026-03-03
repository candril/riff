/**
 * Represents a single file in a diff
 */
export interface DiffFile {
  filename: string
  oldFilename?: string // For renames
  additions: number
  deletions: number
  status: "added" | "modified" | "deleted" | "renamed"
  content: string // The diff content for this file
}

/**
 * Parse a unified diff into individual files
 */
export function parseDiff(diff: string): DiffFile[] {
  const files: DiffFile[] = []

  if (!diff.trim()) {
    return files
  }

  // Split by "diff --git" markers
  const fileDiffs = diff.split(/^diff --git /m).slice(1)

  for (const fileDiff of fileDiffs) {
    const lines = fileDiff.split("\n")

    // Parse header: "a/path/to/file b/path/to/file"
    const headerMatch = lines[0]?.match(/a\/(.*?) b\/(.*)/)
    if (!headerMatch) continue

    const oldPath = headerMatch[1] ?? ""
    const newPath = headerMatch[2] ?? ""
    let additions = 0
    let deletions = 0

    // Count additions and deletions
    for (const line of lines) {
      if (line.startsWith("+") && !line.startsWith("+++")) additions++
      if (line.startsWith("-") && !line.startsWith("---")) deletions++
    }

    // Determine file status
    let status: DiffFile["status"] = "modified"
    if (oldPath === "/dev/null" || lines.some((l) => l.startsWith("new file"))) {
      status = "added"
    } else if (newPath === "/dev/null" || lines.some((l) => l.startsWith("deleted file"))) {
      status = "deleted"
    } else if (oldPath !== newPath) {
      status = "renamed"
    }

    const filename = status === "deleted" ? oldPath : newPath
    if (filename) {
      files.push({
        filename,
        oldFilename: oldPath !== newPath ? oldPath : undefined,
        additions,
        deletions,
        status,
        content: "diff --git " + fileDiff,
      })
    }
  }

  return files
}

/**
 * Sort files by folder first, then alphabetically within each folder.
 * This matches the file tree sorting for consistent ordering.
 */
export function sortFiles(files: DiffFile[]): DiffFile[] {
  return [...files].sort((a, b) => {
    const partsA = a.filename.split("/")
    const partsB = b.filename.split("/")
    
    // Compare path components
    const maxLen = Math.max(partsA.length, partsB.length)
    for (let i = 0; i < maxLen; i++) {
      const partA = partsA[i]
      const partB = partsB[i]
      
      // If one path is shorter, it's a "parent" level
      if (partA === undefined) return -1
      if (partB === undefined) return 1
      
      const isLastA = i === partsA.length - 1
      const isLastB = i === partsB.length - 1
      
      // At the same level: directories come before files
      if (!isLastA && isLastB) return -1  // A is dir, B is file
      if (isLastA && !isLastB) return 1   // A is file, B is dir
      
      // Same type (both dirs or both files at this level): alphabetical
      const cmp = partA.localeCompare(partB)
      if (cmp !== 0) return cmp
    }
    
    return 0
  })
}

/**
 * Get file extension for syntax highlighting
 */
export function getFiletype(filename: string): string | undefined {
  const ext = filename.slice(filename.lastIndexOf("."))
  const filetypeMap: Record<string, string> = {
    ".ts": "typescript",
    ".tsx": "tsx",
    ".js": "javascript",
    ".jsx": "jsx",
    ".py": "python",
    ".rs": "rust",
    ".go": "go",
    ".md": "markdown",
    ".json": "json",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".toml": "toml",
    ".html": "html",
    ".css": "css",
    ".scss": "scss",
    ".sh": "bash",
    ".bash": "bash",
    ".zsh": "bash",
  }
  return filetypeMap[ext]
}

/**
 * Count the number of lines in a diff string (raw line count)
 */
export function countDiffLines(diff: string): number {
  if (!diff.trim()) return 0
  return diff.split("\n").length
}

/**
 * Count the number of visible lines that DiffRenderable will display.
 * This counts only the actual diff content lines (after @@ markers),
 * not the header lines (diff --git, index, ---, +++, etc.)
 */
export function countVisibleDiffLines(diff: string): number {
  if (!diff.trim()) return 0
  
  const lines = diff.split("\n")
  let count = 0
  let inHunk = false
  
  for (const line of lines) {
    if (line.startsWith("@@")) {
      inHunk = true
      count++ // The @@ line itself is shown
      continue
    }
    
    if (inHunk) {
      // Lines in hunks: +, -, space, or \ (no newline marker)
      if (line.startsWith("+") || line.startsWith("-") || line.startsWith(" ") || line.startsWith("\\")) {
        count++
      } else if (line.startsWith("@@")) {
        count++ // Another hunk
      } else if (line.startsWith("diff ")) {
        // New file starts, but we're counting per-file so stop
        break
      }
    }
  }
  
  return count
}

/**
 * Line mapping for all-files view.
 * Maps global line numbers to file index and local line within that file.
 */
export interface LineMapping {
  fileIndex: number
  localLine: number  // 1-indexed line within the file's diff content
  isHeader: boolean  // True if this line is a file header or spacing (not commentable)
}

/**
 * Get the cumulative line counts for each file in all-files view.
 * Returns array where entry[i] is the starting global line (1-indexed) for file i.
 * Each file contributes: 1 header + diffLines + 1 spacing
 */
export function getFileLineOffsets(files: DiffFile[]): number[] {
  const offsets: number[] = []
  let currentLine = 1
  
  for (const file of files) {
    offsets.push(currentLine)
    const diffLines = countDiffLines(file.content)
    // 1 header + diffLines + 1 spacing
    currentLine += 1 + diffLines + 1
  }
  
  return offsets
}

/**
 * Get total line count for all files combined view.
 */
export function getTotalLineCount(files: DiffFile[]): number {
  if (files.length === 0) return 0
  
  let total = 0
  for (const file of files) {
    // 1 header + visible diff lines + 1 spacing
    total += 1 + countVisibleDiffLines(file.content) + 1
  }
  return total
}

/**
 * Get file and local line for a global line number (1-indexed).
 * Returns null if line is on a header or spacing line.
 */
export function getFileAtLine(files: DiffFile[], globalLine: number): LineMapping | null {
  if (files.length === 0 || globalLine < 1) return null
  
  let currentLine = 1
  
  for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
    const file = files[fileIndex]!
    const diffLines = countVisibleDiffLines(file.content)
    
    // Header line
    if (globalLine === currentLine) {
      return { fileIndex, localLine: 0, isHeader: true }
    }
    currentLine++
    
    // Diff content lines
    const diffStart = currentLine
    const diffEnd = currentLine + diffLines - 1
    if (globalLine >= diffStart && globalLine <= diffEnd) {
      const localLine = globalLine - diffStart + 1
      return { fileIndex, localLine, isHeader: false }
    }
    currentLine += diffLines
    
    // Spacing line
    if (globalLine === currentLine) {
      return { fileIndex, localLine: diffLines + 1, isHeader: true }
    }
    currentLine++
  }
  
  return null
}
