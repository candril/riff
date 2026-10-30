/**
 * DiffLineMapping - Maps visual lines to diff lines to file/line numbers
 */

import { createHash } from "node:crypto"
import { alignMarkdownTables } from "../utils/markdown-tables"
import { findFoldableBlocks, blockAt, type FoldableBlock } from "../utils/fenced-blocks"
import type { DiffFile } from "../utils/diff-parser"
import type { Comment } from "../types"
import type { DiffLine, CommentAnchor, DiffLineMappingOptions, RenderedLine } from "./types"
import type { LineSource } from "./line-source"

export function anchorSide(type: DiffLine["type"], pane: "left" | "right" | undefined): CommentAnchor["side"] | null {
  if (type === "deletion") return pane === "right" ? null : "LEFT"
  if (type === "addition") return pane === "left" ? null : "RIGHT"
  return pane === "left" ? "LEFT" : "RIGHT"
}

/** The version of a file a line number counts in: the change's result, or what it changed. */
export type FileSide = "new" | "old"

export function lineNumOn(line: Pick<DiffLine, "newLineNum" | "oldLineNum">, side: FileSide): number | undefined {
  return side === "old" ? line.oldLineNum : line.newLineNum
}

export class DiffLineMapping implements LineSource {
  private lines: DiffLine[] = []
  private expandedDividers: ReadonlySet<string>
  private fileContents: Map<string, string>
  private collapsedFiles: ReadonlySet<string>
  private collapsedBlocks: ReadonlySet<string>
  private visibleFiles: ReadonlySet<string> | undefined
  private outsideDiff: boolean
  private renderedFiles: ReadonlyMap<string, readonly RenderedLine[]>

  constructor(
    files: DiffFile[],
    mode: "single" | "all",
    fileIndex?: number,
    options?: DiffLineMappingOptions
  ) {
    this.expandedDividers = options?.expandedDividers ?? new Set()
    this.fileContents = options?.fileContents ?? new Map()
    this.collapsedFiles = options?.collapsedFiles ?? new Set()
    this.collapsedBlocks = options?.collapsedBlocks ?? new Set()
    this.visibleFiles = options?.visibleFiles
    this.outsideDiff = options?.outsideDiff ?? false
    this.renderedFiles = options?.renderedFiles ?? new Map()
    
    if (mode === "single" && fileIndex !== undefined && files[fileIndex]) {
      this.lines = this.parseSingleFile(files[fileIndex], fileIndex)
    } else if (mode === "all") {
      this.lines = this.parseAllFiles(files)
    }

    if (options?.alignMarkdownTables !== false) {
      this.alignTables()
    }

    // After the tables, before anything reads a row: a folded fence is one
    // row where its lines were, so every index below it must already count
    // it that way.
    if (this.collapsedBlocks.size > 0) this.foldBlocks()
  }

  /**
   * Pad markdown table cells onto a shared grid, in place.
   *
   * A display transform, not an edit: the row count is untouched, so every
   * line number, hunk and comment anchor still points where it did, and
   * `content` stays the one truth for columns (search, motions, the
   * cursor). The file's own text moves to `sourceContent`.
   */
  private alignTables(): void {
    // A rendered row is aligned already, and its sourceContent is the file's
    // line, which a second alignment would overwrite with the rendered text.
    const alignable = this.lines.map((line) => (line.rendered ? { ...line, type: "rendered" } : line))
    for (const { index, content } of alignMarkdownTables(alignable)) {
      const line = this.lines[index]!
      this.lines[index] = { ...line, content, sourceContent: line.content }
    }
  }

  /**
   * Replace each folded fence with a single row standing for it (spec 073).
   * The row keeps the opening fence's file and line number, so a comment
   * anchor and the cursor still point where they did.
   */
  private foldBlocks(): void {
    const folded: DiffLine[] = []
    const blocks = findFoldableBlocks(this.lines)
    let skipTo = -1

    for (let row = 0; row < this.lines.length; row++) {
      if (row <= skipTo) continue
      const line = this.lines[row]!
      const block = blocks.find((candidate) => candidate.start === row)
      if (!block || !this.collapsedBlocks.has(block.id)) {
        folded.push({ ...line, visualIndex: folded.length })
        continue
      }

      const label = block.info ? `\`\`\`${block.info}` : "```"
      folded.push({
        ...line,
        visualIndex: folded.length,
        content: `${label}  ▸ ${block.size} line${block.size === 1 ? "" : "s"}`,
        blockFoldId: block.id,
      })
      skipTo = block.end
    }

    this.lines = folded
  }

  /** The fenced blocks in the rows as they stand (spec 073). */
  get foldableBlocks(): FoldableBlock[] {
    return findFoldableBlocks(this.lines)
  }

  /**
   * The ids of a file's blocks, folded or open, or of every file's without
   * one (spec 073). A folded block has no fences left to scan for.
   */
  blockIdsIn(filename?: string): string[] {
    const inFile = (name: string | undefined) => !filename || name === filename
    const open = this.foldableBlocks.filter((block) => inFile(block.filename)).map((block) => block.id)
    const folded = this.lines.flatMap((line) => (line.blockFoldId && inFile(line.filename) ? [line.blockFoldId] : []))
    return [...open, ...folded]
  }

  /**
   * The block a row falls in, fences included (spec 073).
   *
   * A folded block is one row whose closing fence is not in the mapping at
   * all, so it cannot be found by scanning for fences — it carries its id.
   */
  blockAtLine(visualIndex: number): FoldableBlock | null {
    const line = this.lines[visualIndex]
    if (line?.blockFoldId) {
      return {
        id: line.blockFoldId,
        filename: line.filename ?? "",
        start: visualIndex,
        end: visualIndex,
        info: "",
        size: 0,
      }
    }
    return blockAt(this.foldableBlocks, visualIndex)
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
   * Get comment anchor info for a line. `pane` is the split pane the cursor
   * is in: a context line is drawn in both, so the pane picks its side, and
   * a removal or an addition is only there to anchor in its own pane.
   */
  getCommentAnchor(visualIndex: number, pane?: "left" | "right"): CommentAnchor | null {
    const line = this.lines[visualIndex]
    if (!line || !this.isCommentable(visualIndex)) return null
    if (!line.filename) return null

    const side = anchorSide(line.type, pane)
    if (!side) return null
    const lineNum = side === "LEFT" ? line.oldLineNum : line.newLineNum
    if (lineNum === undefined) return null

    return {
      filename: line.filename,
      line: lineNum,
      side,
      // Two different refusals used to share one answer of `null`: riff has
      // no line here, and GitHub cannot anchor to this one. Only the first
      // is a reason to have no anchor. The second is a note (spec 085).
      note: line.expanded === true || this.outsideDiff,
    }
  }

  /**
   * True for a line that is only on screen because the user expanded a
   * collapsed region. Callers use it to explain why commenting is refused.
   */
  isOutsideDiff(visualIndex: number): boolean {
    if (this.outsideDiff) return this.lines[visualIndex] !== undefined
    return this.lines[visualIndex]?.expanded === true
  }

  /**
   * The row's own text, hashed — what will say the line moved (spec 083).
   * Trimmed first, so reindenting a block does not invalidate every note in
   * it, and taken from `sourceContent` where a display transform rewrote
   * the row (an aligned markdown table).
   */
  hashAt(visualIndex: number): string | undefined {
    const line = this.lines[visualIndex]
    if (!line) return undefined
    const text = line.sourceContent ?? line.content
    return createHash("sha256").update(text.trim()).digest("hex").slice(0, 16)
  }

  /** Where is this comment, if riff is showing the line at all. */
  hasRowFor(comment: Pick<Comment, "filename" | "line" | "side">): boolean {
    return this.findLineForComment(comment) !== null
  }

  /** True when riff is showing files rather than a diff (spec 084). */
  isFileMode(): boolean {
    return this.outsideDiff
  }

  /**
   * Find visual line for a comment (reverse lookup)
   */
  findLineForComment(comment: Pick<Comment, "filename" | "line" | "side">): number | null {
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
      if (this.visibleFiles && !this.visibleFiles.has(file.filename)) continue
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
        ...(this.renderedFiles.has(file.filename) ? { rendered: true as const } : {}),
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

      // Spacing after file (except last, and not for collapsed files)
      if (fileIndex < files.length - 1 && !isCollapsed) {
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
    const rendered = this.renderedFiles.get(filename)
    if (rendered) return this.parseRendered(content, rendered, fileIndex, filename)

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
      // `endLine` of 0 means "to the end of the file, however long that is":
      // the length is only known once the file itself has been fetched, and
      // a count riff has not measured is not one it should print (spec 074).
      const unknownLength = endLine === 0
      const skippedLines = unknownLength ? 0 : endLine - startLine + 1
      if (!unknownLength && skippedLines <= 0) return
      
      const dividerKey = `${filename}:${position}:${dividerIndex}`
      const isExpanded = this.expandedDividers.has(dividerKey)
      
      if (isExpanded && fullFileLines.length > 0) {
        // The run is text the change did not touch, so the two sides number
        // it in step: a line sits `newLineNum - oldLineNum` further down the
        // new file than the old one, the shift the surrounding hunks carry.
        // These lines come out of the new file, so the old side is that shift
        // back — and it has to be, or the old file's colours (spec 080) and
        // the comments anchored to its lines land on the wrong rows.
        const shift = newLineNum - oldLineNum
        const last = unknownLength ? fullFileLines.length : endLine
        for (let lineNum = startLine; lineNum <= last; lineNum++) {
          const lineContent = fullFileLines[lineNum - 1] ?? ""  // Convert to 0-indexed
          const oldLine = lineNum - shift
          lines.push({
            visualIndex: lines.length,
            type: "context",
            content: lineContent,
            rawLine: ` ${lineContent}`,
            oldLineNum: oldLine >= 1 ? oldLine : undefined,
            newLineNum: lineNum,
            expanded: true,
            fileIndex,
            filename,
          })
        }
      } else {
        // Show collapsed divider with its key stored
        lines.push({
          visualIndex: lines.length,
          type: "divider",
          content: unknownLength
            ? "rest of the file"
            : skippedLines === 1
              ? "1 line"
              : `${skippedLines} lines`,
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

    // The run after the last hunk. Its length is the file's, which riff only
    // knows once it has the file — so before then the row says "rest of the
    // file" rather than a number it is guessing at (spec 074). Once the file
    // is in hand the row carries the count, or goes away because the hunk
    // reached the end after all.
    // File mode's one hunk is the whole file, so there is no rest of it to
    // offer — and offering it drew a row that expanded into nothing.
    if (lastHunkEndLine > 0 && !this.outsideDiff) {
      if (totalFileLines === 0) addDividerOrContext(lastHunkEndLine + 1, 0, 0, "end")
      else if (lastHunkEndLine < totalFileLines) {
        addDividerOrContext(lastHunkEndLine + 1, totalFileLines, 0, "end")
      }
    }

    return lines
  }
  
  /**
   * A markdown file's rendered rows in place of its hunks (spec 111). The
   * rows are the new version only, so they carry no old line. GitHub can
   * anchor only inside a hunk, so a row rendered from any other line is
   * expanded, and a comment there is a note as on expanded context.
   */
  private parseRendered(
    diff: string,
    rows: readonly RenderedLine[],
    fileIndex: number,
    filename: string
  ): DiffLine[] {
    const source = this.fileContents.get(filename)?.split("\n") ?? []
    const anchorable = newLinesInHunks(diff)
    return rows.map((row, visualIndex) => {
      const sourceContent = source[row.sourceLine - 1] ?? ""
      return {
        visualIndex,
        type: "context",
        content: row.text,
        sourceContent,
        rawLine: ` ${sourceContent}`,
        newLineNum: row.sourceLine,
        ...(anchorable.has(row.sourceLine) ? {} : { expanded: true }),
        rendered: true,
        renderedSpans: row.spans,
        ...(row.code ? { renderedCode: row.code } : {}),
        ...(row.part !== undefined ? { renderedPart: row.part } : {}),
        ...(row.lastLine !== undefined ? { renderedLastLine: row.lastLine } : {}),
        fileIndex,
        filename,
      }
    })
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

  /**
   * Find the visual line index for a given file line number.
   * Returns null if the line is in a collapsed divider region.
   * 
   * @param filename - The filename to search in
   * @param lineNum - The 1-indexed line number in the file
   * @param side - Which version of the file `lineNum` counts in
   */
  findVisualLineForFileLine(filename: string, lineNum: number, side: FileSide = "new"): number | null {
    for (let i = 0; i < this.lines.length; i++) {
      const line = this.lines[i]!
      if (line.filename === filename && lineNumOn(line, side) === lineNum) {
        return i
      }
    }
    return null  // Line is collapsed or not in diff
  }

  /**
   * Find which divider contains a given file line (for auto-expansion).
   * Returns the divider key if the line is within a collapsed divider's range.
   * Returns null if the line is visible or not in any divider.
   * 
   * Note: This is a simplified version. For full implementation, we would need
   * to track the line ranges that each divider covers during parsing.
   * 
   * @param filename - The filename to search in
   * @param lineNum - The 1-indexed line number in the file
   */
  findDividerForLine(filename: string, lineNum: number, side: FileSide = "new"): string | null {
    // For now, look through dividers and check if lineNum might be in their range
    // This requires tracking divider ranges which we'd need to add to parsing
    
    // Simple approach: find dividers for this file and check their position
    // in relation to surrounding visible lines
    for (let i = 0; i < this.lines.length; i++) {
      const line = this.lines[i]
      if (line?.type === "divider" && line.filename === filename && line.dividerKey) {
        // Check the lines around this divider to see if lineNum might be in its range
        // Find the last visible line before the divider
        let prevLineNum = 0
        for (let j = i - 1; j >= 0; j--) {
          const prev = this.lines[j]
          const prevNum = prev?.filename === filename ? lineNumOn(prev, side) : undefined
          if (prevNum !== undefined) {
            prevLineNum = prevNum
            break
          }
        }
        
        // Find the first visible line after the divider
        let nextLineNum = Infinity
        for (let j = i + 1; j < this.lines.length; j++) {
          const next = this.lines[j]
          const nextNum = next?.filename === filename ? lineNumOn(next, side) : undefined
          if (nextNum !== undefined) {
            nextLineNum = nextNum
            break
          }
        }
        
        // If lineNum is between prevLineNum and nextLineNum, it's in this divider
        if (lineNum > prevLineNum && lineNum < nextLineNum) {
          return line.dividerKey
        }
      }
    }
    
    return null
  }
}

/** The new-side lines a file's hunks show, added or context: where GitHub can anchor. */
function newLinesInHunks(diff: string): Set<number> {
  const lines = new Set<number>()
  let newLine = 0
  let inHunk = false
  for (const raw of diff.split("\n")) {
    const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (hunk) {
      newLine = parseInt(hunk[1]!, 10)
      inHunk = true
      continue
    }
    if (!inHunk) continue
    if (raw.startsWith("+") || raw.startsWith(" ")) lines.add(newLine++)
  }
  return lines
}
