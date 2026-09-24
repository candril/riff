/**
 * SearchEngine - Pattern matching for in-view search
 * 
 * Searches against the full file content (from fileContentCache), not just
 * visible diff lines. This allows finding matches anywhere in the file.
 */

import type { DiffLineMapping } from "./line-mapping"
import type { IncrementalSearchMatch, FileSearchMatch } from "./search-state"

/**
 * What a query means, for `/` and for the occurrence picker (spec 088) alike:
 * the two must not disagree about what the same text matches.
 *
 * Literal and smart-case, as vim's `smartcase`: an uppercase letter in the
 * query is asking for that case.
 */
export function compileSearchPattern(pattern: string): RegExp | null {
  if (!pattern) return null

  try {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const caseSensitive = pattern !== pattern.toLowerCase()
    return new RegExp(escaped, caseSensitive ? "g" : "gi")
  } catch {
    return null
  }
}

/** The word (`\w+`) the column sits on, or null off a word. */
export function wordAt(content: string, col: number): string | null {
  const wordChars = /[\w]/
  if (col >= content.length || !wordChars.test(content[col] ?? "")) return null

  let start = col
  while (start > 0 && wordChars.test(content[start - 1] ?? "")) start--

  let end = col
  while (end < content.length && wordChars.test(content[end] ?? "")) end++

  return content.slice(start, end)
}

export class SearchEngine {
  constructor(
    private getMapping: () => DiffLineMapping,
    private getFileContent: (filename: string) => string | null
  ) {}

  compilePattern(pattern: string): RegExp | null {
    return compileSearchPattern(pattern)
  }

  /**
   * Find all matches in the full file content.
   * Returns matches with file line numbers (1-indexed) that may need to be
   * mapped to visual lines (may require expanding dividers).
   */
  findAllMatchesInFile(filename: string, regex: RegExp): FileSearchMatch[] {
    const content = this.getFileContent(filename)
    if (!content) return []
    
    const lines = content.split("\n")
    const matches: FileSearchMatch[] = []
    
    for (let lineNum = 1; lineNum <= lines.length; lineNum++) {
      const lineContent = lines[lineNum - 1]!
      regex.lastIndex = 0
      
      let match: RegExpExecArray | null
      while ((match = regex.exec(lineContent)) !== null) {
        matches.push({
          filename,
          lineNum,        // 1-indexed file line number
          startCol: match.index,
          endCol: match.index + match[0].length,
        })
        
        // Prevent infinite loop on zero-length matches
        if (match[0].length === 0) regex.lastIndex++
      }
    }
    
    return matches
  }

  /**
   * Whether a file's raw diff text has a match on one of its content rows.
   *
   * Used to decide whether a collapsed file is worth opening, so only its
   * code counts — a hit on `diff --git`, `@@` or `+++` would open a file the
   * user cannot see the match in.
   */
  diffContainsMatch(diff: string, regex: RegExp): boolean {
    for (const raw of diff.split("\n")) {
      const marker = raw[0]
      if (marker !== " " && marker !== "+" && marker !== "-") continue
      if (raw.startsWith("+++") || raw.startsWith("---")) continue
      regex.lastIndex = 0
      if (regex.test(raw.slice(1))) return true
    }
    return false
  }

  /**
   * Find all matches in the visual line mapping (diff lines only).
   * This searches the visible content without needing full file content.
   */
  findAllMatchesInMapping(regex: RegExp): IncrementalSearchMatch[] {
    const mapping = this.getMapping()
    const matches: IncrementalSearchMatch[] = []
    
    for (let i = 0; i < mapping.lineCount; i++) {
      const line = mapping.getLine(i)
      if (!line) continue
      
      // Skip non-content lines (headers, dividers, spacing)
      if (!["context", "addition", "deletion"].includes(line.type)) {
        continue
      }
      
      const content = line.content
      regex.lastIndex = 0
      
      let match: RegExpExecArray | null
      while ((match = regex.exec(content)) !== null) {
        matches.push({
          line: i,
          startCol: match.index,
          endCol: match.index + match[0].length,
          filename: line.filename,
        })
        
        // Prevent infinite loop on zero-length matches
        if (match[0].length === 0) regex.lastIndex++
      }
    }
    
    return matches
  }

  /**
   * Get word under cursor for * and # commands.
   * Returns the word at the given position, or null if not on a word.
   */
  getWordUnderCursor(line: number, col: number): string | null {
    const mapping = this.getMapping()
    const content = mapping.getLineContent(line)
    return content ? wordAt(content, col) : null
  }

  /**
   * Find the next/previous match from a given position.
   * Wraps around if no match found in the direction.
   */
  findNextMatch(
    matches: IncrementalSearchMatch[],
    currentLine: number,
    currentCol: number,
    direction: "forward" | "backward"
  ): { match: IncrementalSearchMatch | null; index: number; wrapped: boolean } {
    if (matches.length === 0) {
      return { match: null, index: -1, wrapped: false }
    }
    
    if (direction === "forward") {
      // Find first match after current position
      for (let i = 0; i < matches.length; i++) {
        const m = matches[i]!
        if (m.line > currentLine || (m.line === currentLine && m.startCol > currentCol)) {
          return { match: m, index: i, wrapped: false }
        }
      }
      // Wrap to first match
      return { match: matches[0]!, index: 0, wrapped: true }
    } else {
      // Find last match before current position
      for (let i = matches.length - 1; i >= 0; i--) {
        const m = matches[i]!
        if (m.line < currentLine || (m.line === currentLine && m.startCol < currentCol)) {
          return { match: m, index: i, wrapped: false }
        }
      }
      // Wrap to last match
      return { match: matches[matches.length - 1]!, index: matches.length - 1, wrapped: true }
    }
  }

  /**
   * Find match at current cursor position (for highlighting current match)
   */
  findMatchAtPosition(
    matches: IncrementalSearchMatch[],
    line: number,
    col: number
  ): number {
    for (let i = 0; i < matches.length; i++) {
      const m = matches[i]!
      if (m.line === line && m.startCol <= col && col < m.endCol) {
        return i
      }
    }
    return -1
  }
}
