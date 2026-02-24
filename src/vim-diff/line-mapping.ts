/**
 * DiffLineMapping - Maps visual lines to diff lines to file/line numbers
 */

import type { DiffFile } from "../utils/diff-parser"
import type { Comment } from "../types"
import type { DiffLine, CommentAnchor, SearchMatch } from "./types"

export class DiffLineMapping {
  private lines: DiffLine[] = []

  constructor(
    files: DiffFile[],
    mode: "single" | "all",
    fileIndex?: number
  ) {
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
   * Find next/previous hunk
   */
  findHunk(fromLine: number, direction: "next" | "prev"): number | null {
    const delta = direction === "next" ? 1 : -1
    for (
      let i = fromLine + delta;
      i >= 0 && i < this.lines.length;
      i += delta
    ) {
      if (this.lines[i]?.type === "hunk-header") {
        return i
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

    let line = visualIndex
    let c = col
    let content = this.getLineContent(line)

    // Helper to move to next/prev position
    const move = (): boolean => {
      if (direction === "forward") {
        c++
        if (c >= content.length) {
          // Move to next line
          line++
          if (line >= this.lineCount) {
            line = this.lineCount - 1
            c = Math.max(0, this.getLineContent(line).length - 1)
            return false
          }
          content = this.getLineContent(line)
          c = 0
        }
      } else {
        c--
        if (c < 0) {
          // Move to prev line
          line--
          if (line < 0) {
            line = 0
            c = 0
            return false
          }
          content = this.getLineContent(line)
          c = Math.max(0, content.length - 1)
        }
      }
      return true
    }

    // w/W: Move to start of next word
    if (motion === "w" || motion === "W") {
      // Skip current word
      if (content.length > 0) {
        const startChar = content[c] ?? " "
        if (isBigWord) {
          // Skip non-whitespace
          while (c < content.length && !isWhitespace(content[c]!)) {
            if (!move()) return { line, col: c }
          }
        } else {
          // Skip same type chars
          const startIsWord = isWordChar(startChar)
          while (c < content.length) {
            const ch = content[c]!
            if (isWhitespace(ch)) break
            if (startIsWord !== isWordChar(ch)) break
            if (!move()) return { line, col: c }
          }
        }
      }
      // Skip whitespace
      while (line < this.lineCount) {
        while (c < content.length && isWhitespace(content[c]!)) {
          if (!move()) return { line, col: c }
        }
        if (c < content.length && !isWhitespace(content[c]!)) {
          break
        }
        // Empty line or end of line, move to next
        if (!move()) return { line, col: c }
      }
      return { line, col: c }
    }

    // e/E: Move to end of word
    if (motion === "e" || motion === "E") {
      // Move forward one to start
      if (!move()) return { line, col: c }

      // Skip whitespace
      while (line < this.lineCount && c < content.length && isWhitespace(content[c]!)) {
        if (!move()) return { line, col: c }
      }

      // Move to end of word
      if (isBigWord) {
        while (c + 1 < content.length && !isWhitespace(content[c + 1]!)) {
          if (!move()) return { line, col: c }
        }
      } else {
        const startIsWord = isWordChar(content[c] ?? " ")
        while (c + 1 < content.length) {
          const nextCh = content[c + 1]!
          if (isWhitespace(nextCh)) break
          if (startIsWord !== isWordChar(nextCh)) break
          if (!move()) return { line, col: c }
        }
      }
      return { line, col: c }
    }

    // b/B: Move to start of previous word
    if (motion === "b" || motion === "B") {
      // Move back one to start
      if (!move()) return { line, col: c }

      // Skip whitespace backwards
      while (line >= 0 && (c < 0 || isWhitespace(content[c] ?? " "))) {
        if (!move()) return { line, col: c }
      }

      // Move to start of word
      if (isBigWord) {
        while (c > 0 && !isWhitespace(content[c - 1]!)) {
          if (!move()) return { line, col: c }
        }
      } else {
        const endIsWord = isWordChar(content[c] ?? " ")
        while (c > 0) {
          const prevCh = content[c - 1]!
          if (isWhitespace(prevCh)) break
          if (endIsWord !== isWordChar(prevCh)) break
          if (!move()) return { line, col: c }
        }
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

      // File header
      allLines.push({
        visualIndex: allLines.length,
        type: "file-header",
        content: file.filename,
        rawLine: `--- ${file.filename} (+${file.additions}/-${file.deletions})`,
        fileIndex,
        filename: file.filename,
      })

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

    let oldLineNum = 0
    let newLineNum = 0
    let inHunk = false

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

      // Hunk header
      const hunkMatch = rawLine.match(
        /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/
      )
      if (hunkMatch) {
        oldLineNum = parseInt(hunkMatch[1]!, 10)
        newLineNum = parseInt(hunkMatch[3]!, 10)
        inHunk = true

        lines.push({
          visualIndex: lines.length,
          type: "hunk-header",
          content: rawLine,
          rawLine,
          fileIndex,
          filename,
          hunkInfo: {
            oldStart: oldLineNum,
            oldCount: parseInt(hunkMatch[2] ?? "1", 10),
            newStart: newLineNum,
            newCount: parseInt(hunkMatch[4] ?? "1", 10),
          },
        })
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

    return lines
  }
}
