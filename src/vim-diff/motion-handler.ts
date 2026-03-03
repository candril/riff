/**
 * VimMotionHandler - Handles vim-style key bindings for navigation
 */

import type { VimCursorState } from "./types"
import type { DiffLineMapping } from "./line-mapping"
import {
  moveCursorToLine,
  moveCursorToCol,
  enterVisualLineMode,
  exitVisualMode,
  addToJumpList,
  jumpBack,
  jumpForward,
  setMark,
  jumpToMark,
  setSearch,
  setPendingFindChar,
  completeFindChar,
} from "./cursor-state"

export interface KeyEvent {
  name: string
  sequence?: string
  ctrl?: boolean
  alt?: boolean
  shift?: boolean
}

export interface VimMotionHandlerOptions {
  getMapping: () => DiffLineMapping
  getState: () => VimCursorState
  setState: (state: VimCursorState) => void
  getViewportHeight: () => number
  onCursorMove: () => void
}

export class VimMotionHandler {
  private getMapping: () => DiffLineMapping
  private getState: () => VimCursorState
  private setState: (state: VimCursorState) => void
  private getViewportHeight: () => number
  private onCursorMove: () => void

  // For gg detection
  private lastKeyTime: number = 0
  private lastKey: string = ""

  constructor(options: VimMotionHandlerOptions) {
    this.getMapping = options.getMapping
    this.getState = options.getState
    this.setState = options.setState
    this.getViewportHeight = options.getViewportHeight
    this.onCursorMove = options.onCursorMove
  }

  /**
   * Handle a keypress, return true if handled
   */
  handleKey(key: KeyEvent): boolean {
    const state = this.getState()
    const mapping = this.getMapping()

    // Handle pending find character (f/F/t/T waiting for char)
    if (state.pendingFindChar) {
      return this.handlePendingFindChar(key, state, mapping)
    }

    // Escape - exit visual mode
    if (key.name === "escape") {
      if (state.mode === "visual-line") {
        this.setState(exitVisualMode(state))
        this.onCursorMove()
        return true
      }
      return false
    }

    // V - enter visual line mode
    if (key.name === "v" && key.shift) {
      this.setState(enterVisualLineMode(state))
      this.onCursorMove()
      return true
    }

    // Basic vertical motions
    if (key.name === "j" || key.name === "down") {
      this.moveLine(1)
      return true
    }
    if (key.name === "k" || key.name === "up") {
      this.moveLine(-1)
      return true
    }

    // Page motions
    if (key.name === "d" && key.ctrl) {
      this.moveLine(Math.floor(this.getViewportHeight() / 2))
      return true
    }
    if (key.name === "u" && key.ctrl) {
      this.moveLine(-Math.floor(this.getViewportHeight() / 2))
      return true
    }
    if (key.name === "f" && key.ctrl) {
      this.moveLine(this.getViewportHeight() - 2)
      return true
    }
    if (key.name === "b" && key.ctrl) {
      this.moveLine(-(this.getViewportHeight() - 2))
      return true
    }

    // G - go to bottom (check BEFORE gg to handle shift correctly)
    if ((key.name === "G") || (key.name === "g" && key.shift)) {
      this.goToLine(mapping.lineCount - 1)
      return true
    }

    // gg - go to top (detect double g)
    if (key.name === "g" && !key.ctrl && !key.alt && !key.shift) {
      const now = Date.now()
      if (this.lastKey === "g" && now - this.lastKeyTime < 500) {
        this.goToLine(0)
        this.lastKey = ""
        return true
      }
      this.lastKey = "g"
      this.lastKeyTime = now
      return true
    }

    // Word motions
    if (key.name === "w" && !key.ctrl) {
      this.moveWord(key.shift ? "W" : "w")
      return true
    }
    if (key.name === "e" && !key.ctrl) {
      this.moveWord(key.shift ? "E" : "e")
      return true
    }
    if (key.name === "b" && !key.ctrl) {
      this.moveWord(key.shift ? "B" : "b")
      return true
    }

    // Horizontal motions
    if (key.name === "h" || key.name === "left") {
      this.moveCol(-1)
      return true
    }
    if (key.name === "l" || key.name === "right") {
      this.moveCol(1)
      return true
    }

    // Line position motions
    if (key.name === "0") {
      this.goToCol(0)
      return true
    }
    // ^ - first non-space (shift+6 on US keyboard, or direct ^)
    if (
      key.sequence === "^" ||
      (key.name === "6" && key.shift) ||
      key.name === "^"
    ) {
      this.goToFirstNonSpace()
      return true
    }
    // $ - end of line (shift+4 on US keyboard, or direct $)
    if (
      key.sequence === "$" ||
      (key.name === "4" && key.shift) ||
      key.name === "$"
    ) {
      this.goToEndOfLine()
      return true
    }

    // Find character motions (f/F/t/T)
    if (key.name === "f" && !key.ctrl) {
      this.setState(setPendingFindChar(state, key.shift ? "F" : "f"))
      return true
    }
    if (key.name === "t" && !key.ctrl) {
      this.setState(setPendingFindChar(state, key.shift ? "T" : "t"))
      return true
    }

    // Repeat find character (; and ,)
    if (key.name === ";" || key.sequence === ";") {
      this.repeatFindChar(false)
      return true
    }
    if (key.name === "," || key.sequence === ",") {
      this.repeatFindChar(true)
      return true
    }

    // Hunk navigation (]c and [c)
    // These are usually handled as key sequences, check for them
    if (key.sequence === "]c" || (key.name === "c" && this.lastKey === "]")) {
      this.moveToHunk("next")
      this.lastKey = ""
      return true
    }
    if (key.sequence === "[c" || (key.name === "c" && this.lastKey === "[")) {
      this.moveToHunk("prev")
      this.lastKey = ""
      return true
    }
    if (key.name === "]" || key.name === "[") {
      this.lastKey = key.name
      this.lastKeyTime = Date.now()
      return true
    }

    // File navigation (]f and [f)
    if (key.sequence === "]f" || (key.name === "f" && this.lastKey === "]" && !key.ctrl)) {
      this.moveToFile("next")
      this.lastKey = ""
      return true
    }
    if (key.sequence === "[f" || (key.name === "f" && this.lastKey === "[" && !key.ctrl)) {
      this.moveToFile("prev")
      this.lastKey = ""
      return true
    }

    // Jump list navigation
    if (key.name === "o" && key.ctrl) {
      const newState = jumpBack(state)
      if (newState) {
        this.setState(newState)
        this.onCursorMove()
      }
      return true
    }
    if (key.name === "i" && key.ctrl) {
      const newState = jumpForward(state)
      if (newState) {
        this.setState(newState)
        this.onCursorMove()
      }
      return true
    }

    // Marks (m{char} to set, '{char} to jump)
    if (key.name === "m" && !key.ctrl) {
      // Next key will be the mark name - handled externally for simplicity
      // For now, we don't handle this inline
      return false
    }

    // Reset last key if not a sequence character
    if (!["g", "]", "[", "m", "'"].includes(key.name)) {
      this.lastKey = ""
    }

    return false
  }

  /**
   * Handle pending find character motion
   */
  private handlePendingFindChar(
    key: KeyEvent,
    state: VimCursorState,
    mapping: DiffLineMapping
  ): boolean {
    // Cancel on escape
    if (key.name === "escape") {
      this.setState(setPendingFindChar(state, null))
      return true
    }

    // Get the character
    const char = key.sequence || key.name
    if (!char || char.length !== 1) {
      this.setState(setPendingFindChar(state, null))
      return true
    }

    const pendingType = state.pendingFindChar!.type
    const newCol = mapping.findCharInLine(state.line, state.col, char, pendingType)

    if (newCol !== null) {
      const lineLen = mapping.getLineContent(state.line).length
      const newState = moveCursorToCol(
        completeFindChar(state, char),
        newCol,
        lineLen
      )
      this.setState(newState)
      this.onCursorMove()
    } else {
      // Character not found, just clear pending state
      this.setState(completeFindChar(state, char))
    }

    return true
  }

  /**
   * Move cursor by delta lines
   */
  private moveLine(delta: number): void {
    const state = this.getState()
    const mapping = this.getMapping()
    const newLine = state.line + delta
    const lineLen = mapping.getLineContent(
      Math.max(0, Math.min(newLine, mapping.lineCount - 1))
    ).length

    const newState = moveCursorToLine(
      state,
      newLine,
      mapping.lineCount,
      lineLen,
      true
    )
    this.setState(newState)
    this.onCursorMove()
  }

  /**
   * Go to specific line (with jump list)
   */
  private goToLine(line: number): void {
    const state = this.getState()
    const mapping = this.getMapping()

    // Add to jump list for large jumps
    if (Math.abs(line - state.line) > 1) {
      const withJump = addToJumpList(state)
      const lineLen = mapping.getLineContent(line).length
      const newState = moveCursorToLine(
        withJump,
        line,
        mapping.lineCount,
        lineLen,
        false
      )
      this.setState(newState)
    } else {
      const lineLen = mapping.getLineContent(line).length
      const newState = moveCursorToLine(
        state,
        line,
        mapping.lineCount,
        lineLen,
        false
      )
      this.setState(newState)
    }
    this.onCursorMove()
  }

  /**
   * Move cursor by delta columns
   */
  private moveCol(delta: number): void {
    const state = this.getState()
    const mapping = this.getMapping()
    const lineLen = mapping.getLineContent(state.line).length
    const newState = moveCursorToCol(state, state.col + delta, lineLen)
    this.setState(newState)
    this.onCursorMove()
  }

  /**
   * Go to specific column
   */
  private goToCol(col: number): void {
    const state = this.getState()
    const mapping = this.getMapping()
    const lineLen = mapping.getLineContent(state.line).length
    const newState = moveCursorToCol(state, col, lineLen)
    this.setState(newState)
    this.onCursorMove()
  }

  /**
   * Go to first non-space character
   */
  private goToFirstNonSpace(): void {
    const state = this.getState()
    const mapping = this.getMapping()
    const col = mapping.findFirstNonSpace(state.line)
    const lineLen = mapping.getLineContent(state.line).length
    const newState = moveCursorToCol(state, col, lineLen)
    this.setState(newState)
    this.onCursorMove()
  }

  /**
   * Go to end of line
   */
  private goToEndOfLine(): void {
    const state = this.getState()
    const mapping = this.getMapping()
    const lineLen = mapping.getLineContent(state.line).length
    const newState = moveCursorToCol(state, Math.max(0, lineLen - 1), lineLen)
    this.setState(newState)
    this.onCursorMove()
  }

  /**
   * Move by word (w/e/b/W/E/B)
   */
  private moveWord(motion: "w" | "e" | "b" | "W" | "E" | "B"): void {
    const state = this.getState()
    const mapping = this.getMapping()
    const direction =
      motion === "b" || motion === "B" ? "backward" : "forward"
    const result = mapping.findWordBoundary(
      state.line,
      state.col,
      direction,
      motion
    )

    const lineLen = mapping.getLineContent(result.line).length
    let newState = moveCursorToLine(
      state,
      result.line,
      mapping.lineCount,
      lineLen,
      false
    )
    newState = moveCursorToCol(newState, result.col, lineLen)
    this.setState(newState)
    this.onCursorMove()
  }

  /**
   * Repeat last find character motion
   */
  private repeatFindChar(reverse: boolean): void {
    const state = this.getState()
    if (!state.lastFindChar) return

    const mapping = this.getMapping()
    let type = state.lastFindChar.type

    // Reverse direction if requested
    if (reverse) {
      if (type === "f") type = "F"
      else if (type === "F") type = "f"
      else if (type === "t") type = "T"
      else if (type === "T") type = "t"
    }

    const newCol = mapping.findCharInLine(
      state.line,
      state.col,
      state.lastFindChar.char,
      type
    )

    if (newCol !== null) {
      const lineLen = mapping.getLineContent(state.line).length
      const newState = moveCursorToCol(state, newCol, lineLen)
      this.setState(newState)
      this.onCursorMove()
    }
  }

  /**
   * Move to next/previous hunk
   */
  private moveToHunk(direction: "next" | "prev"): void {
    const state = this.getState()
    const mapping = this.getMapping()
    const hunkLine = mapping.findHunk(state.line, direction)

    if (hunkLine !== null) {
      const withJump = addToJumpList(state)
      const lineLen = mapping.getLineContent(hunkLine).length
      const newState = moveCursorToLine(
        withJump,
        hunkLine,
        mapping.lineCount,
        lineLen,
        false
      )
      this.setState(newState)
      this.onCursorMove()
    }
  }

  /**
   * Move to next/previous file header
   */
  private moveToFile(direction: "next" | "prev"): void {
    const state = this.getState()
    const mapping = this.getMapping()
    const fileLine = mapping.findFileHeader(state.line, direction)

    if (fileLine !== null) {
      const withJump = addToJumpList(state)
      const lineLen = mapping.getLineContent(fileLine).length
      const newState = moveCursorToLine(
        withJump,
        fileLine,
        mapping.lineCount,
        lineLen,
        false
      )
      this.setState(newState)
      this.onCursorMove()
    }
  }

  /**
   * Handle search (called externally with pattern)
   */
  handleSearch(
    pattern: string,
    direction: "forward" | "backward"
  ): boolean {
    const state = this.getState()
    const mapping = this.getMapping()

    const match = mapping.search(pattern, state.line, direction)
    if (match) {
      const withSearch = setSearch(addToJumpList(state), pattern, direction)
      const lineLen = mapping.getLineContent(match.line).length
      let newState = moveCursorToLine(
        withSearch,
        match.line,
        mapping.lineCount,
        lineLen,
        false
      )
      newState = moveCursorToCol(newState, match.col, lineLen)
      this.setState(newState)
      this.onCursorMove()
      return true
    }
    return false
  }

  /**
   * Repeat last search (n/N)
   */
  repeatSearch(reverse: boolean): boolean {
    const state = this.getState()
    if (!state.lastSearch) return false

    const direction = reverse
      ? state.searchDirection === "forward"
        ? "backward"
        : "forward"
      : state.searchDirection

    return this.handleSearch(state.lastSearch, direction)
  }

  /**
   * Set a mark at current position
   */
  handleSetMark(mark: string): void {
    const state = this.getState()
    this.setState(setMark(state, mark))
  }

  /**
   * Jump to a mark
   */
  handleJumpToMark(mark: string): boolean {
    const state = this.getState()
    const newState = jumpToMark(state, mark)
    if (newState) {
      this.setState(newState)
      this.onCursorMove()
      return true
    }
    return false
  }
}
