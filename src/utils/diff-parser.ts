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
