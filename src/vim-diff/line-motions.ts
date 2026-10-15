import type { LineSource } from "./line-source"
import type { SearchMatch } from "./types"

/**
 * Find next/previous hunk (change block).
 *
 * A "hunk" is a contiguous block of addition/deletion lines.
 * - Next: skip past current change block (if any), then find the first
 *   change line of the next block.
 * - Prev: skip back past current change block (if any), then find the
 *   first change line (in reading order) of the previous block.
 */
export function findHunk(
  source: LineSource,
  fromLine: number,
  direction: "next" | "prev"
): number | null {
  const isChange = (i: number) => {
    const t = source.getLine(i)?.type
    return t === "addition" || t === "deletion"
  }

  if (direction === "next") {
    let i = fromLine + 1
    // 1. Skip past remaining lines of the current change block
    while (i < source.lineCount && isChange(i)) i++
    // 2. Skip past non-change lines (context, dividers, headers, spacing)
    while (i < source.lineCount && !isChange(i)) i++
    // 3. Return the first change line of the next block (if any)
    return i < source.lineCount ? i : null
  } else {
    let i = fromLine - 1
    // 1. Skip past remaining lines of the current change block (going up)
    while (i >= 0 && isChange(i)) i--
    // 2. Skip past non-change lines
    while (i >= 0 && !isChange(i)) i--
    // 3. We're now on the last line of the previous change block;
    //    walk back to find its first line
    if (i < 0) return null
    while (i > 0 && isChange(i - 1)) i--
    return i
  }
}

export function findFileHeader(
  source: LineSource,
  fromLine: number,
  direction: "next" | "prev"
): number | null {
  const delta = direction === "next" ? 1 : -1
  for (
    let i = fromLine + delta;
    i >= 0 && i < source.lineCount;
    i += delta
  ) {
    if (source.getLine(i)?.type === "file-header") {
      return i
    }
  }
  return null
}

export function searchLines(
  source: LineSource,
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
  const totalLines = source.lineCount
  for (let count = 0; count < totalLines; count++) {
    let i = startLine + count * delta
    // Wrap around
    if (i >= totalLines) i = i % totalLines
    if (i < 0) i = totalLines + (i % totalLines)

    const line = source.getLine(i)
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

export function findWordBoundary(
  source: LineSource,
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
  
  const getContent = (l: number): string => source.getLineContent(l)
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
      if (line >= source.lineCount) {
        return { line: source.lineCount - 1, col: Math.max(0, getContent(source.lineCount - 1).length - 1) }
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
        if (line >= source.lineCount) {
          return { line: source.lineCount - 1, col: Math.max(0, getContent(source.lineCount - 1).length - 1) }
        }
        content = getContent(line)
        c = 0
      }
      
      if (content.length === 0) {
        line++
        if (line >= source.lineCount) {
          return { line: source.lineCount - 1, col: Math.max(0, getContent(source.lineCount - 1).length - 1) }
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

export function findCharInLine(
  source: LineSource,
  visualIndex: number,
  col: number,
  char: string,
  motion: "f" | "F" | "t" | "T"
): number | null {
  const content = source.getLineContent(visualIndex)
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

export function findFirstNonSpace(
  source: LineSource,
  visualIndex: number
): number {
  const content = source.getLineContent(visualIndex)
  for (let i = 0; i < content.length; i++) {
    if (!/\s/.test(content[i]!)) {
      return i
    }
  }
  return 0
}
