/**
 * DiffLineMapping - Maps visual lines to diff lines to file/line numbers
 */

import type { DiffFile } from "../utils/diff-parser"
import type { Comment } from "../types"
import type { DiffLine, CommentAnchor, SearchMatch, DiffLineMappingOptions } from "./types"

export class DiffLineMapping {
  private lines: DiffLine[] = []
  private expandedDividers: Set<string>
  private fileContents: Map<string, string>
  private collapsedFiles: Set<string>

  constructor(
    files: DiffFile[],
    mode: "single" | "all",
    fileIndex?: number,
    options?: DiffLineMappingOptions
  ) {
    this.expandedDividers = options?.expandedDividers ?? new Set()
    this.fileContents = options?.fileContents ?? new Map()
    this.collapsedFiles = options?.collapsedFiles ?? new Set()
    
    if (mode === "single" && fileIndex !== undefined && files[fileIndex]) {
      this.lines = this.parseSingleFile(files[fileIndex], fileIndex)
    } else if (mode === "all") {
      this.lines = this.parseAllFiles(files)
    }
  }

  /**
   * Get total number of visual lines
   */
  get lineCount(): number {
    return this.lines.length
  }

  /**
   * Get all lines (for iteration)
   */
  get allLines(): readonly DiffLine[] {
    return this.lines
  }

  /**
   * Get DiffLine at visual index (0-indexed)
   */
  getLine(visualIndex: number): DiffLine | undefined {
    return this.lines[visualIndex]
  }

  /**
   * Get line content for vim motions
   * Returns content without +/- prefix (matches what's displayed on screen)
   */
  getLineContent(visualIndex: number): string {
    return this.lines[visualIndex]?.content ?? ""
  }

  /**
   * Get raw line (with +/- prefix)
   */
  getRawLine(visualIndex: number): string {
    return this.lines[visualIndex]?.rawLine ?? ""
  }

  /**
   * Check if line is commentable (not header/spacing)
   */
  isCommentable(visualIndex: number): boolean {
    const line = this.lines[visualIndex]
    if (!line) return false
    return ["context", "addition", "deletion"].includes(line.type)
  }

  /**
   * Get comment anchor info for a line
   */
  getCommentAnchor(visualIndex: number): CommentAnchor | null {
    const line = this.lines[visualIndex]
    if (!line || !this.isCommentable(visualIndex)) return null
    if (!line.filename) return null

    const lineNum = line.type === "deletion" ? line.oldLineNum : line.newLineNum
    if (lineNum === undefined) return null

    return {
      filename: line.filename,
      line: lineNum,
      side: line.type === "deletion" ? "LEFT" : "RIGHT",
    }
  }

  /**
   * Find visual line for a comment (reverse lookup)
   */
  findLineForComment(comment: Comment): number | null {
    for (let i = 0; i < this.lines.length; i++) {
      const line = this.lines[i]!
      if (line.filename === comment.filename) {
        const lineNum =
          comment.side === "LEFT" ? line.oldLineNum : line.newLineNum
        if (lineNum === comment.line) {
          return i
        }
      }
    }
    return null
  }

  /**
   * Find next/previous hunk (change block)
   * Finds dividers or the first addition/deletion after context
   */
  findHunk(fromLine: number, direction: "next" | "prev"): number | null {
    const delta = direction === "next" ? 1 : -1
    let foundDivider = false
    
    for (
      let i = fromLine + delta;
      i >= 0 && i < this.lines.length;
      i += delta
    ) {
      const line = this.lines[i]
      if (!line) continue
      
      // Divider marks the start of a new chunk
      if (line.type === "divider" || line.type === "hunk-header") {
        foundDivider = true
        continue
      }
      
      // After a divider, return the first change line
      if (foundDivider && (line.type === "addition" || line.type === "deletion")) {
        return i
      }
      
      // Also find change after file header
      if (line.type === "file-header") {
        foundDivider = true
        continue
      }
    }
    return null
  }

  /**
   * Find next/previous file header
   */
  findFileHeader(fromLine: number, direction: "next" | "prev"): number | null {
    const delta = direction === "next" ? 1 : -1
    for (
      let i = fromLine + delta;
      i >= 0 && i < this.lines.length;
      i += delta
    ) {
      if (this.lines[i]?.type === "file-header") {
        return i
      }
    }
    return null
  }

  /**
   * Search for pattern in line contents
   */
  search(
    pattern: string | RegExp,
    fromLine: number,
    direction: "forward" | "backward"
  ): SearchMatch | null {
    const regex =
      typeof pattern === "string"
        ? new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
        : pattern

    const delta = direction === "forward" ? 1 : -1
    const startLine = fromLine + delta

    // Wrap around search
    const totalLines = this.lines.length
    for (let count = 0; count < totalLines; count++) {
      let i = startLine + count * delta
      // Wrap around
      if (i >= totalLines) i = i % totalLines
      if (i < 0) i = totalLines + (i % totalLines)

      const line = this.lines[i]
      if (!line) continue

      const match = line.content.match(regex)
      if (match && match.index !== undefined) {
        return {
          line: i,
          col: match.index,
          length: match[0].length,
        }
      }
    }

    return null
  }

  /**
   * Find word boundary for vim motions (w/e/b/W/E/B)
   */
  findWordBoundary(
    visualIndex: number,
    col: number,
    direction: "forward" | "backward",
    motion: "w" | "e" | "b" | "W" | "E" | "B"
  ): { line: number; col: number } {
    const isWordChar = (c: string): boolean => /\w/.test(c)
    const isWhitespace = (c: string): boolean => /\s/.test(c)
    const isBigWord = motion === "W" || motion === "E" || motion === "B"
    
    // Character type for vim word motions
    const charType = (c: string): "word" | "punct" | "space" => {
      if (isWhitespace(c)) return "space"
      if (isWordChar(c)) return "word"
      return "punct"
    }

    let line = visualIndex
    let c = col
    
    const getContent = (l: number): string => this.getLineContent(l)
    const getChar = (l: number, col: number): string | undefined => getContent(l)[col]
    
    // w: Move to start of next word
    if (motion === "w" || motion === "W") {
      let content = getContent(line)
      
      // First, skip current word/punct sequence
      if (c < content.length) {
        const startType = isBigWord ? (isWhitespace(content[c]!) ? "space" : "word") : charType(content[c]!)
        while (c < content.length) {
          const ch = content[c]!
          const currentType = isBigWord ? (isWhitespace(ch) ? "space" : "word") : charType(ch)
          if (currentType !== startType) break
          c++
        }
      }
      
      // Then skip whitespace (possibly across lines)
      while (true) {
        // Skip whitespace on current line
        while (c < content.length && isWhitespace(content[c]!)) {
          c++
        }
        
        // If we found a non-whitespace char, we're done
        if (c < content.length) {
          return { line, col: c }
        }
        
        // Move to next line
        line++
        if (line >= this.lineCount) {
          return { line: this.lineCount - 1, col: Math.max(0, getContent(this.lineCount - 1).length - 1) }
        }
        content = getContent(line)
        c = 0
        
        // If line is empty, continue to next line
        if (content.length === 0) continue
        
        // Skip leading whitespace
        while (c < content.length && isWhitespace(content[c]!)) {
          c++
        }
        if (c < content.length) {
          return { line, col: c }
        }
      }
    }

    // e: Move to end of word
    if (motion === "e" || motion === "E") {
      let content = getContent(line)
      
      // Move forward at least one position
      c++
      
      // Skip whitespace (possibly across lines)
      while (true) {
        if (c >= content.length) {
          line++
          if (line >= this.lineCount) {
            return { line: this.lineCount - 1, col: Math.max(0, getContent(this.lineCount - 1).length - 1) }
          }
          content = getContent(line)
          c = 0
        }
        
        if (content.length === 0) {
          line++
          if (line >= this.lineCount) {
            return { line: this.lineCount - 1, col: Math.max(0, getContent(this.lineCount - 1).length - 1) }
          }
          content = getContent(line)
          c = 0
          continue
        }
        
        if (!isWhitespace(content[c]!)) break
        c++
      }
      
      // Now find end of current word
      const startType = isBigWord ? "word" : charType(content[c]!)
      while (c + 1 < content.length) {
        const nextCh = content[c + 1]!
        const nextType = isBigWord ? (isWhitespace(nextCh) ? "space" : "word") : charType(nextCh)
        if (nextType !== startType || nextType === "space") break
        c++
      }
      
      return { line, col: c }
    }

    // b: Move to start of previous word
    if (motion === "b" || motion === "B") {
      let content = getContent(line)
      
      // Move backward at least one position
      c--
      
      // Skip whitespace backwards (possibly across lines)
      while (true) {
        if (c < 0) {
          line--
          if (line < 0) {
            return { line: 0, col: 0 }
          }
          content = getContent(line)
          c = content.length - 1
          if (c < 0) continue  // Empty line
        }
        
        if (!isWhitespace(content[c]!)) break
        c--
      }
      
      // Now find start of current word
      const endType = isBigWord ? "word" : charType(content[c]!)
      while (c > 0) {
        const prevCh = content[c - 1]!
        const prevType = isBigWord ? (isWhitespace(prevCh) ? "space" : "word") : charType(prevCh)
        if (prevType !== endType || prevType === "space") break
        c--
      }
      
      return { line, col: c }
    }

    return { line: visualIndex, col }
  }

  /**
   * Find character in line for f/F/t/T motions
   */
  findCharInLine(
    visualIndex: number,
    col: number,
    char: string,
    motion: "f" | "F" | "t" | "T"
  ): number | null {
    const content = this.getLineContent(visualIndex)
    const forward = motion === "f" || motion === "t"
    const till = motion === "t" || motion === "T"

    if (forward) {
      for (let i = col + 1; i < content.length; i++) {
        if (content[i] === char) {
          return till ? i - 1 : i
        }
      }
    } else {
      for (let i = col - 1; i >= 0; i--) {
        if (content[i] === char) {
          return till ? i + 1 : i
        }
      }
    }

    return null
  }

  /**
   * Find first non-whitespace character in line
   */
  findFirstNonSpace(visualIndex: number): number {
    const content = this.getLineContent(visualIndex)
    for (let i = 0; i < content.length; i++) {
      if (!/\s/.test(content[i]!)) {
        return i
      }
    }
    return 0
  }

  /**
   * Get file index for a visual line
   */
  getFileIndex(visualIndex: number): number | undefined {
    return this.lines[visualIndex]?.fileIndex
  }

  // ============ Private parsing methods ============

  private parseSingleFile(file: DiffFile, fileIndex: number): DiffLine[] {
    return this.parseFileContent(file.content, fileIndex, file.filename)
  }

  private parseAllFiles(files: DiffFile[]): DiffLine[] {
    const allLines: DiffLine[] = []

    for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
      const file = files[fileIndex]!
      const isCollapsed = this.collapsedFiles.has(file.filename)

      // File header (always shown, even when collapsed)
      allLines.push({
        visualIndex: allLines.length,
        type: "file-header",
        content: file.filename,
        rawLine: `--- ${file.filename} (+${file.additions}/-${file.deletions})`,
        fileIndex,
        filename: file.filename,
        isCollapsed,  // Mark if this file is collapsed (for rendering)
      })

      // Skip diff content if file is collapsed
      if (!isCollapsed) {
        // File diff content
        const fileLines = this.parseFileContent(
          file.content,
          fileIndex,
          file.filename
        )
        for (const line of fileLines) {
          line.visualIndex = allLines.length
          allLines.push(line)
        }
      }

      // Spacing after file (except last)
      if (fileIndex < files.length - 1) {
        allLines.push({
          visualIndex: allLines.length,
          type: "spacing",
          content: "",
          rawLine: "",
          fileIndex,
          filename: file.filename,
        })
      }
    }

    return allLines
  }

  private parseFileContent(
    content: string,
    fileIndex: number,
    filename: string
  ): DiffLine[] {
    const lines: DiffLine[] = []
    const rawLines = content.split("\n")
    
    // Get full file content if available (for expansion)
    const fullFileContent = this.fileContents.get(filename)
    const fullFileLines = fullFileContent?.split("\n") ?? []
    const totalFileLines = fullFileLines.length

    let oldLineNum = 0
    let newLineNum = 0
    let inHunk = false
    let prevHunkEndLine = 0  // Track where previous hunk ended (in new file)
    let hunkIndex = 0  // Track which hunk we're on for divider keys
    let isFirstHunk = true
    let lastHunkEndLine = 0  // Track where the final hunk ends

    // Helper to add a divider or expanded context
    const addDividerOrContext = (
      startLine: number,  // 1-indexed, first collapsed line
      endLine: number,    // 1-indexed, last collapsed line  
      dividerIndex: number,
      position: "start" | "middle" | "end"
    ) => {
      const skippedLines = endLine - startLine + 1
      if (skippedLines <= 0) return
      
      const dividerKey = `${filename}:${position}:${dividerIndex}`
      const isExpanded = this.expandedDividers.has(dividerKey)
      
      if (isExpanded && fullFileLines.length > 0) {
        // Insert the collapsed lines as context
        for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
          const lineContent = fullFileLines[lineNum - 1] ?? ""  // Convert to 0-indexed
          lines.push({
            visualIndex: lines.length,
            type: "context",
            content: lineContent,
            rawLine: ` ${lineContent}`,
            oldLineNum: lineNum,
            newLineNum: lineNum,
            fileIndex,
            filename,
          })
        }
      } else {
        // Show collapsed divider with its key stored
        lines.push({
          visualIndex: lines.length,
          type: "divider",
          content: skippedLines === 1 ? "1 line" : `${skippedLines} lines`,
          rawLine: "",
          fileIndex,
          filename,
          dividerKey,
        })
      }
    }

    for (const rawLine of rawLines) {
      // Skip diff --git header lines (we add our own file header in all-files mode)
      if (rawLine.startsWith("diff --git")) continue
      if (rawLine.startsWith("index ")) continue
      if (rawLine.startsWith("--- ")) continue
      if (rawLine.startsWith("+++ ")) continue
      if (rawLine.startsWith("new file")) continue
      if (rawLine.startsWith("deleted file")) continue
      if (rawLine.startsWith("similarity index")) continue
      if (rawLine.startsWith("rename from")) continue
      if (rawLine.startsWith("rename to")) continue

      // Hunk header - convert to divider (subtle separator between chunks)
      const hunkMatch = rawLine.match(
        /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/
      )
      if (hunkMatch) {
        const newHunkStart = parseInt(hunkMatch[3]!, 10)
        
        oldLineNum = parseInt(hunkMatch[1]!, 10)
        newLineNum = newHunkStart
        
        if (isFirstHunk) {
          // Add "start" divider if hunk doesn't start at line 1
          if (newHunkStart > 1) {
            addDividerOrContext(1, newHunkStart - 1, 0, "start")
          }
          isFirstHunk = false
        } else {
          // Add "middle" divider between hunks
          const skippedLines = newHunkStart - prevHunkEndLine - 1
          if (skippedLines > 0) {
            addDividerOrContext(prevHunkEndLine + 1, newHunkStart - 1, hunkIndex, "middle")
            hunkIndex++
          }
        }
        
        inHunk = true
        continue
      }

      if (!inHunk) continue

      // Content lines
      if (rawLine.startsWith("+")) {
        lines.push({
          visualIndex: lines.length,
          type: "addition",
          content: rawLine.slice(1),
          rawLine,
          newLineNum,
          fileIndex,
          filename,
        })
        prevHunkEndLine = newLineNum
        lastHunkEndLine = newLineNum
        newLineNum++
      } else if (rawLine.startsWith("-")) {
        lines.push({
          visualIndex: lines.length,
          type: "deletion",
          content: rawLine.slice(1),
          rawLine,
          oldLineNum,
          fileIndex,
          filename,
        })
        oldLineNum++
      } else if (rawLine.startsWith(" ")) {
        lines.push({
          visualIndex: lines.length,
          type: "context",
          content: rawLine.slice(1),
          rawLine,
          oldLineNum,
          newLineNum,
          fileIndex,
          filename,
        })
        prevHunkEndLine = newLineNum
        lastHunkEndLine = newLineNum
        oldLineNum++
        newLineNum++
      } else if (rawLine.startsWith("\\")) {
        lines.push({
          visualIndex: lines.length,
          type: "no-newline",
          content: rawLine,
          rawLine,
          fileIndex,
          filename,
        })
      }
    }

    // Add "end" divider if there are more lines after the last hunk
    // We need to know the total file length - use fullFileLines if available
    if (totalFileLines > 0 && lastHunkEndLine > 0 && lastHunkEndLine < totalFileLines) {
      addDividerOrContext(lastHunkEndLine + 1, totalFileLines, 0, "end")
    }

    return lines
  }
  
  /**
   * Get the divider key for a visual line (if it's a divider)
   * Returns null if the line is not a divider
   */
  getDividerKey(visualIndex: number): string | null {
    const line = this.lines[visualIndex]
    if (!line || line.type !== "divider") return null
    return line.dividerKey ?? null
  }
}
