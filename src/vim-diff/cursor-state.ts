/**
 * VimCursorState - Manages cursor position, mode, and selection
 */

import type { VimCursorState, VimMode } from "./types"

/**
 * Create initial cursor state
 */
export function createCursorState(): VimCursorState {
  return {
    line: 0,
    col: 0,
    mode: "normal",
    selectionAnchor: null,
    jumpList: [],
    jumpIndex: -1,
    marks: new Map(),
    lastSearch: null,
    searchDirection: "forward",
    desiredCol: null,
    pendingFindChar: null,
    lastFindChar: null,
  }
}

/**
 * Get selection range (sorted start/end)
 */
export function getSelectionRange(
  state: VimCursorState
): [number, number] | null {
  if (state.mode !== "visual-line" || state.selectionAnchor === null) {
    return null
  }

  const start = Math.min(state.selectionAnchor, state.line)
  const end = Math.max(state.selectionAnchor, state.line)
  return [start, end]
}

/**
 * Enter visual line mode
 */
export function enterVisualLineMode(state: VimCursorState): VimCursorState {
  return {
    ...state,
    mode: "visual-line",
    selectionAnchor: state.line,
  }
}

/**
 * Exit visual mode back to normal
 */
export function exitVisualMode(state: VimCursorState): VimCursorState {
  return {
    ...state,
    mode: "normal",
    selectionAnchor: null,
  }
}

/**
 * Move cursor to a new line, preserving or updating column
 */
export function moveCursorToLine(
  state: VimCursorState,
  newLine: number,
  maxLine: number,
  lineLength: number,
  preserveCol: boolean = true
): VimCursorState {
  const clampedLine = Math.max(0, Math.min(newLine, maxLine - 1))

  let newCol: number
  if (preserveCol && state.desiredCol !== null) {
    // Use desired column (for vertical movement)
    newCol = Math.min(state.desiredCol, Math.max(0, lineLength - 1))
  } else if (preserveCol) {
    // Preserve current column
    newCol = Math.min(state.col, Math.max(0, lineLength - 1))
  } else {
    // Reset column
    newCol = 0
  }

  return {
    ...state,
    line: clampedLine,
    col: Math.max(0, newCol),
    desiredCol: preserveCol ? (state.desiredCol ?? state.col) : null,
  }
}

/**
 * Move cursor to a specific column
 */
export function moveCursorToCol(
  state: VimCursorState,
  newCol: number,
  lineLength: number
): VimCursorState {
  const clampedCol = Math.max(0, Math.min(newCol, Math.max(0, lineLength - 1)))
  return {
    ...state,
    col: clampedCol,
    desiredCol: null, // Reset desired col on horizontal movement
  }
}

/**
 * Add current position to jump list
 */
export function addToJumpList(state: VimCursorState): VimCursorState {
  // Truncate jump list at current position and add new entry
  const jumpList = [...state.jumpList.slice(0, state.jumpIndex + 1), state.line]
  // Limit jump list size
  const maxJumps = 100
  const trimmedList =
    jumpList.length > maxJumps ? jumpList.slice(-maxJumps) : jumpList

  return {
    ...state,
    jumpList: trimmedList,
    jumpIndex: trimmedList.length - 1,
  }
}

/**
 * Jump backward in jump list (Ctrl-o)
 */
export function jumpBack(state: VimCursorState): VimCursorState | null {
  if (state.jumpIndex <= 0 || state.jumpList.length === 0) {
    return null
  }

  const newIndex = state.jumpIndex - 1
  const targetLine = state.jumpList[newIndex]
  if (targetLine === undefined) return null

  return {
    ...state,
    line: targetLine,
    col: 0,
    jumpIndex: newIndex,
    desiredCol: null,
  }
}

/**
 * Jump forward in jump list (Ctrl-i)
 */
export function jumpForward(state: VimCursorState): VimCursorState | null {
  if (state.jumpIndex >= state.jumpList.length - 1) {
    return null
  }

  const newIndex = state.jumpIndex + 1
  const targetLine = state.jumpList[newIndex]
  if (targetLine === undefined) return null

  return {
    ...state,
    line: targetLine,
    col: 0,
    jumpIndex: newIndex,
    desiredCol: null,
  }
}

/**
 * Set a mark at current position
 */
export function setMark(state: VimCursorState, mark: string): VimCursorState {
  const marks = new Map(state.marks)
  marks.set(mark, state.line)
  return { ...state, marks }
}

/**
 * Jump to a mark
 */
export function jumpToMark(
  state: VimCursorState,
  mark: string
): VimCursorState | null {
  const targetLine = state.marks.get(mark)
  if (targetLine === undefined) return null

  // Add current position to jump list before jumping
  const withJump = addToJumpList(state)

  return {
    ...withJump,
    line: targetLine,
    col: 0,
    desiredCol: null,
  }
}

/**
 * Set search state
 */
export function setSearch(
  state: VimCursorState,
  pattern: string,
  direction: "forward" | "backward"
): VimCursorState {
  return {
    ...state,
    lastSearch: pattern,
    searchDirection: direction,
  }
}

/**
 * Set pending find character state (for f/F/t/T)
 */
export function setPendingFindChar(
  state: VimCursorState,
  type: "f" | "F" | "t" | "T" | null
): VimCursorState {
  return {
    ...state,
    pendingFindChar: type ? { type } : null,
  }
}

/**
 * Complete find character motion
 */
export function completeFindChar(
  state: VimCursorState,
  char: string
): VimCursorState {
  if (!state.pendingFindChar) return state

  return {
    ...state,
    pendingFindChar: null,
    lastFindChar: {
      type: state.pendingFindChar.type,
      char,
    },
  }
}
