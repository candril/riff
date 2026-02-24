/**
 * Cursor indicator - shows which line is currently selected.
 * Positioned absolutely in the gutter area.
 * Supports visual line mode selection (shows range with different symbols).
 */

import { TextRenderable, type CliRenderer } from "@opentui/core"
import { theme } from "../theme"
import { CURSOR_COL } from "./Gutter"

// Symbols for different parts of the selection
const CURSOR_SYMBOL = ">"         // Normal mode cursor
const SELECTION_TOP = "["         // First line of selection
const SELECTION_MID = "|"         // Middle lines of selection
const SELECTION_BOT = "]"         // Last line of selection
const SELECTION_SINGLE = ">"      // Single-line selection (same as cursor)

// Maximum selection indicators to create (pool size)
const MAX_SELECTION_LINES = 50

export interface CursorIndicatorOptions {
  renderer: CliRenderer
  /** Offset from top of screen (e.g., 1 for header) */
  topOffset: number
  /** Left offset (e.g., for file tree panel) */
  leftOffset: number
}

export class CursorIndicator {
  private renderer: CliRenderer
  private cursorIndicator: TextRenderable
  private selectionIndicators: TextRenderable[] = []
  private topOffset: number
  private leftOffset: number

  constructor(options: CursorIndicatorOptions) {
    this.renderer = options.renderer
    this.topOffset = options.topOffset
    this.leftOffset = options.leftOffset

    // Main cursor indicator (for normal mode)
    this.cursorIndicator = new TextRenderable(options.renderer, {
      id: "cursor-indicator",
      content: CURSOR_SYMBOL,
      fg: theme.pink, // Catppuccin pink - highly visible
      position: "absolute",
      left: this.leftOffset + CURSOR_COL,
      top: this.topOffset,
      width: 1,
      height: 1,
      zIndex: 100,
      visible: false,
    })
    options.renderer.root.add(this.cursorIndicator)

    // Pre-create selection indicators (pooled for performance)
    for (let i = 0; i < MAX_SELECTION_LINES; i++) {
      const indicator = new TextRenderable(options.renderer, {
        id: `selection-indicator-${i}`,
        content: SELECTION_MID,
        fg: theme.mauve, // Catppuccin mauve for selection
        position: "absolute",
        left: this.leftOffset + CURSOR_COL,
        top: 0,
        width: 1,
        height: 1,
        zIndex: 99,
        visible: false,
      })
      options.renderer.root.add(indicator)
      this.selectionIndicators.push(indicator)
    }
  }

  /**
   * Update cursor position based on cursor line and scroll position.
   * For normal mode (single line cursor).
   * @param cursorLine The current cursor line (0-indexed)
   * @param scrollTop Current scroll position
   * @param viewportHeight Visible lines in viewport
   */
  update(cursorLine: number, scrollTop: number, viewportHeight: number): void {
    // Hide all selection indicators
    this.hideSelection()

    const viewportLine = cursorLine - scrollTop

    // Only show if cursor is in visible viewport
    if (viewportLine >= 0 && viewportLine < viewportHeight) {
      this.cursorIndicator.top = viewportLine + this.topOffset
      this.cursorIndicator.left = this.leftOffset + CURSOR_COL
      this.cursorIndicator.visible = true
    } else {
      this.cursorIndicator.visible = false
    }
  }

  /**
   * Update selection indicators for visual line mode.
   * @param startLine Start of selection (0-indexed)
   * @param endLine End of selection (0-indexed)
   * @param cursorLine Current cursor position (0-indexed)
   * @param scrollTop Current scroll position
   * @param viewportHeight Visible lines in viewport
   */
  updateSelection(
    startLine: number,
    endLine: number,
    cursorLine: number,
    scrollTop: number,
    viewportHeight: number
  ): void {
    // Normalize range (start <= end)
    const rangeStart = Math.min(startLine, endLine)
    const rangeEnd = Math.max(startLine, endLine)

    // Hide main cursor in visual mode
    this.cursorIndicator.visible = false

    // Calculate visible range
    const viewportEnd = scrollTop + viewportHeight

    let indicatorIndex = 0
    for (let line = rangeStart; line <= rangeEnd && indicatorIndex < MAX_SELECTION_LINES; line++) {
      const viewportLine = line - scrollTop

      // Skip lines outside viewport
      if (viewportLine < 0 || viewportLine >= viewportHeight) {
        continue
      }

      const indicator = this.selectionIndicators[indicatorIndex]
      if (!indicator) break

      // Determine which symbol to use
      let symbol: string
      if (rangeStart === rangeEnd) {
        // Single line selection
        symbol = SELECTION_SINGLE
      } else if (line === rangeStart) {
        symbol = SELECTION_TOP
      } else if (line === rangeEnd) {
        symbol = SELECTION_BOT
      } else {
        symbol = SELECTION_MID
      }

      // Highlight cursor line differently
      const isCursorLine = line === cursorLine

      indicator.content = symbol
      indicator.fg = isCursorLine ? theme.pink : theme.mauve
      indicator.top = viewportLine + this.topOffset
      indicator.left = this.leftOffset + CURSOR_COL
      indicator.visible = true

      indicatorIndex++
    }

    // Hide unused indicators
    for (let i = indicatorIndex; i < this.selectionIndicators.length; i++) {
      const indicator = this.selectionIndicators[i]
      if (indicator) indicator.visible = false
    }
  }

  /**
   * Hide all selection indicators
   */
  private hideSelection(): void {
    for (const indicator of this.selectionIndicators) {
      indicator.visible = false
    }
  }

  /**
   * Update the left offset (e.g., when file panel is toggled)
   */
  setLeftOffset(leftOffset: number): void {
    this.leftOffset = leftOffset
    this.cursorIndicator.left = leftOffset + CURSOR_COL
    for (const indicator of this.selectionIndicators) {
      indicator.left = leftOffset + CURSOR_COL
    }
  }

  /**
   * Hide the cursor indicator
   */
  hide(): void {
    this.cursorIndicator.visible = false
    this.hideSelection()
  }

  /**
   * Show the cursor indicator
   */
  show(): void {
    this.cursorIndicator.visible = true
  }

  /**
   * Clean up
   */
  destroy(): void {
    this.cursorIndicator.destroy()
    for (const indicator of this.selectionIndicators) {
      indicator.destroy()
    }
    this.selectionIndicators = []
  }
}
