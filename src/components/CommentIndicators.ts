/**
 * Comment indicators - shows which lines have comments.
 * Uses a pool of TextRenderables positioned absolutely in the gutter.
 */

import { TextRenderable, type CliRenderer } from "@opentui/core"
import { colors } from "../theme"
import { COMMENT_COL } from "./Gutter"
import type { Comment } from "../types"

const COMMENT_SYMBOL = "●"

// Colors for different comment states
const STATUS_COLORS: Record<Comment["status"], string> = {
  local: colors.commentLocal,    // Blue - local draft
  pending: colors.commentPending, // Yellow - pending sync
  synced: colors.commentSynced,   // Green - synced
}

// Color for edited synced comments (has localEdit)
const EDITED_COLOR = colors.commentPending  // Yellow - has local changes

/**
 * Get the display color for a comment
 */
function getCommentColor(comment: Comment): string {
  // Edited synced comment (has local changes pending)
  if (comment.status === "synced" && comment.localEdit !== undefined) {
    return EDITED_COLOR
  }
  return STATUS_COLORS[comment.status] || STATUS_COLORS.local
}

export interface CommentIndicatorsOptions {
  renderer: CliRenderer
  /** Offset from top of screen (e.g., 1 for header) */
  topOffset: number
  /** Left offset (e.g., for file tree panel) */
  leftOffset: number
}

export class CommentIndicators {
  private renderer: CliRenderer
  private indicators: TextRenderable[] = []
  private topOffset: number
  private leftOffset: number

  constructor(options: CommentIndicatorsOptions) {
    this.renderer = options.renderer
    this.topOffset = options.topOffset
    this.leftOffset = options.leftOffset
  }

  /**
   * Update indicators based on comments and scroll position.
   * @param comments Comments for the current file
   * @param scrollTop Current scroll position
   * @param viewportHeight Visible lines in viewport
   */
  update(
    comments: Comment[],
    scrollTop: number,
    viewportHeight: number
  ): void {
    // Calculate which comments are visible
    // Note: comment.line is 1-indexed, we convert to 0-indexed for viewport calc
    const visibleComments = comments.filter((c) => {
      const viewportLine = (c.line - 1) - scrollTop
      return viewportLine >= 0 && viewportLine < viewportHeight
    })

    // Ensure we have enough indicator renderables
    this.ensureIndicatorCount(visibleComments.length)

    // Position visible indicators
    for (let i = 0; i < visibleComments.length; i++) {
      const comment = visibleComments[i]!
      const indicator = this.indicators[i]!
      const viewportLine = (comment.line - 1) - scrollTop

      indicator.top = viewportLine + this.topOffset
      indicator.left = this.leftOffset + COMMENT_COL
      indicator.fg = getCommentColor(comment)
      indicator.visible = true
    }

    // Hide unused indicators
    for (let i = visibleComments.length; i < this.indicators.length; i++) {
      this.indicators[i]!.visible = false
    }
  }

  /**
   * Update the left offset (e.g., when file panel is toggled)
   */
  setLeftOffset(leftOffset: number): void {
    this.leftOffset = leftOffset
    for (const indicator of this.indicators) {
      indicator.left = leftOffset + COMMENT_COL
    }
  }

  /**
   * Hide all indicators
   */
  hide(): void {
    for (const indicator of this.indicators) {
      indicator.visible = false
    }
  }

  /**
   * Ensure we have at least `count` indicator renderables
   */
  private ensureIndicatorCount(count: number): void {
    while (this.indicators.length < count) {
      const indicator = new TextRenderable(this.renderer, {
        id: `comment-indicator-${this.indicators.length}`,
        content: COMMENT_SYMBOL,
        fg: STATUS_COLORS.local,
        position: "absolute",
        left: this.leftOffset + COMMENT_COL,
        top: 0,
        width: 1,
        height: 1,
        zIndex: 99, // Below cursor indicator
        visible: false,
      })
      this.renderer.root.add(indicator)
      this.indicators.push(indicator)
    }
  }

  /**
   * Clean up all indicators
   */
  destroy(): void {
    for (const indicator of this.indicators) {
      indicator.destroy()
    }
    this.indicators = []
  }
}
