/**
 * Cursor indicator - shows which line is currently selected.
 * Positioned absolutely in the gutter area.
 */

import { TextRenderable, type CliRenderer } from "@opentui/core"
import { theme } from "../theme"
import { CURSOR_COL } from "./Gutter"

const CURSOR_SYMBOL = "▶"

export interface CursorIndicatorOptions {
  renderer: CliRenderer
  /** Offset from top of screen (e.g., 1 for header) */
  topOffset: number
  /** Left offset (e.g., for file tree panel) */
  leftOffset: number
}

export class CursorIndicator {
  private indicator: TextRenderable
  private topOffset: number
  private leftOffset: number

  constructor(options: CursorIndicatorOptions) {
    this.topOffset = options.topOffset
    this.leftOffset = options.leftOffset

    this.indicator = new TextRenderable(options.renderer, {
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

    options.renderer.root.add(this.indicator)
  }

  /**
   * Update cursor position based on cursor line and scroll position.
   * @param cursorLine The current cursor line (0-indexed)
   * @param scrollTop Current scroll position
   * @param viewportHeight Visible lines in viewport
   */
  update(cursorLine: number, scrollTop: number, viewportHeight: number): void {
    const viewportLine = cursorLine - scrollTop

    // Only show if cursor is in visible viewport
    if (viewportLine >= 0 && viewportLine < viewportHeight) {
      this.indicator.top = viewportLine + this.topOffset
      this.indicator.left = this.leftOffset + CURSOR_COL
      this.indicator.visible = true
    } else {
      this.indicator.visible = false
    }
  }

  /**
   * Update the left offset (e.g., when file panel is toggled)
   */
  setLeftOffset(leftOffset: number): void {
    this.leftOffset = leftOffset
    this.indicator.left = leftOffset + CURSOR_COL
  }

  /**
   * Hide the cursor indicator
   */
  hide(): void {
    this.indicator.visible = false
  }

  /**
   * Show the cursor indicator
   */
  show(): void {
    this.indicator.visible = true
  }

  /**
   * Clean up
   */
  destroy(): void {
    this.indicator.destroy()
  }
}
