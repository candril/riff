/**
 * Review preview - functional component for submitting reviews
 * 
 * Tab-based navigation through 4 sections:
 * 1. Input area - type summary/body
 * 2. Type selection - Comment/Approve/Request Changes (h/l to pick)
 * 3. Comments list - grouped by file, 2-3 line preview (j/k, space to toggle)
 * 4. Submit button - Enter to submit
 */

import { Box, Text } from "@opentui/core"
import { theme, colors } from "../theme"

// Highlight color for selected comment (subtle blue tint)
const highlightBg = "#2a2d3d"

/**
 * Simple inline markdown to plain text with basic formatting hints
 * Strips markdown syntax and returns clean text
 * (Full markdown rendering would require MarkdownRenderable which is class-based)
 */
function stripMarkdown(text: string): string {
  return text
    // Remove inline code backticks
    .replace(/`([^`]+)`/g, '$1')
    // Remove bold **text** or __text__
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    // Remove italic *text* or _text_
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    // Remove links [text](url)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove headers
    .replace(/^#+\s*/gm, '')
}
import type { Comment } from "../types"
import type { ReviewPreviewState, ReviewPreviewSection } from "../state"

export type ReviewEvent = "COMMENT" | "APPROVE" | "REQUEST_CHANGES"

/**
 * Extract context lines from a diff hunk (last N lines, skip @@ header)
 */
function extractContextLines(diffHunk: string | undefined, maxLines: number = 2): string[] {
  if (!diffHunk) return []
  
  // Split and filter empty lines, skip the @@ header
  const lines = diffHunk.split("\n").filter(l => l.trim() && !l.startsWith("@@"))
  if (lines.length === 0) return []
  
  // Take the last N lines (most relevant to the comment)
  return lines.slice(-maxLines)
}

/**
 * Get diff line color based on prefix
 */
function getDiffLineColor(line: string): string {
  if (line.startsWith("+")) return colors.addedFg
  if (line.startsWith("-")) return colors.removedFg
  return theme.overlay0
}

/**
 * Comment with validation status
 */
export interface ValidatedComment {
  comment: Comment
  valid: boolean
  reason?: string // Why it's invalid (e.g., "file not in diff", "line out of range")
}

export interface ReviewPreviewProps {
  comments: ValidatedComment[]
  state: ReviewPreviewState
  isOwnPr?: boolean // True if current user is the PR author
  currentUser?: string // Current GitHub username
}

const eventLabels: Record<ReviewEvent, string> = {
  COMMENT: "Comment",
  APPROVE: "Approve", 
  REQUEST_CHANGES: "Changes",
}

const eventColors: Record<ReviewEvent, string> = {
  COMMENT: theme.blue,
  APPROVE: theme.green,
  REQUEST_CHANGES: theme.peach,
}

/**
 * Group comments by filename
 */
function groupCommentsByFile(comments: ValidatedComment[]): Map<string, ValidatedComment[]> {
  const groups = new Map<string, ValidatedComment[]>()
  for (const vc of comments) {
    const filename = vc.comment.filename
    const group = groups.get(filename) || []
    group.push(vc)
    groups.set(filename, group)
  }
  return groups
}

/**
 * Get validation message for current state
 */
function getValidationMessage(
  state: ReviewPreviewState,
  validComments: ValidatedComment[],
  includedCount: number,
  isOwnPr: boolean
): { message: string; type: "error" | "warning" | "info" } | null {
  const event = state.selectedEvent
  
  // Own PR + Approve or Request Changes
  if (isOwnPr && (event === "APPROVE" || event === "REQUEST_CHANGES")) {
    return {
      message: event === "APPROVE" 
        ? "Cannot approve your own pull request"
        : "Cannot request changes on your own pull request",
      type: "error"
    }
  }
  
  // Request Changes with no comments
  if (event === "REQUEST_CHANGES" && includedCount === 0 && !state.body.trim()) {
    return {
      message: "Request Changes requires a comment or review body",
      type: "warning"
    }
  }
  
  // Info: Approving with comments
  if (event === "APPROVE" && includedCount > 0) {
    return {
      message: `Approving with ${includedCount} comment${includedCount !== 1 ? "s" : ""}`,
      type: "info"
    }
  }
  
  return null
}

/**
 * Check if submit is allowed
 */
function canSubmit(
  state: ReviewPreviewState,
  includedCount: number,
  isOwnPr: boolean
): boolean {
  const event = state.selectedEvent
  
  // Cannot approve/request changes on own PR
  if (isOwnPr && (event === "APPROVE" || event === "REQUEST_CHANGES")) {
    return false
  }
  
  // Request Changes needs at least a comment or body
  if (event === "REQUEST_CHANGES" && includedCount === 0 && !state.body.trim()) {
    return false
  }
  
  // Comment needs at least one comment or body
  if (event === "COMMENT" && includedCount === 0 && !state.body.trim()) {
    return false
  }
  
  return true
}



/**
 * Review preview modal - 4-section tab navigation
 */
export function ReviewPreview({ 
  comments, 
  state, 
  isOwnPr = false,
}: ReviewPreviewProps) {
  const validComments = comments.filter(c => c.valid)
  const invalidComments = comments.filter(c => !c.valid)
  const includedCount = validComments.filter(c => !state.excludedCommentIds.has(c.comment.id)).length
  const groupedComments = groupCommentsByFile(validComments)
  
  const validation = getValidationMessage(state, validComments, includedCount, isOwnPr)
  const submitAllowed = canSubmit(state, includedCount, isOwnPr)
  
  const isFocused = (section: ReviewPreviewSection) => state.focusedSection === section

  // Build flat list of comment indices for j/k navigation
  // (used to map highlightedIndex to actual comment)
  const flatCommentList: ValidatedComment[] = []
  for (const [, group] of groupedComments) {
    flatCommentList.push(...group)
  }

  return Box(
    {
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      zIndex: 50,
      justifyContent: "center",
      alignItems: "center",
    },
    // Dim background
    Box({
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      backgroundColor: "#00000080",
    }),
    // Modal
    Box(
      {
        width: 80,
        maxHeight: "80%",
        flexDirection: "column",
        backgroundColor: theme.mantle,
        overflow: "hidden",
      },
      // Header
      Box(
        { 
          flexDirection: "row", 
          justifyContent: "space-between",
          paddingX: 2,
          paddingY: 1,
        },
        Text({ content: "Submit Review", fg: theme.text }),
        Text({ content: "esc", fg: theme.overlay0 })
      ),
      
      // Section 1: Input area
      Box(
        {
          flexDirection: "column",
          paddingX: 2,
          paddingY: 1,
        },
        Text({ 
          content: isFocused("input") ? "Summary (type to edit)" : "Summary", 
          fg: theme.subtext0,
        }),
        Box(
          {
            backgroundColor: theme.base,
            paddingX: 1,
            marginTop: 1,
            minHeight: 3,
          },
          Text({ 
            content: state.body 
              ? (isFocused("input") ? state.body + "█" : state.body)
              : (isFocused("input") ? "█" : "(optional)"), 
            fg: state.body ? theme.text : theme.overlay0,
          })
        )
      ),
      
      // Section 2: Type selection
      Box(
        {
          flexDirection: "column",
          paddingX: 2,
          paddingY: 1,
        },
        Text({ 
          content: isFocused("type") ? "Type (h/l to change)" : "Type", 
          fg: theme.subtext0,
        }),
        Box(
          { flexDirection: "row", gap: 2, marginTop: 1 },
          ...(["COMMENT", "APPROVE", "REQUEST_CHANGES"] as ReviewEvent[]).map(event => {
            const isSelected = event === state.selectedEvent
            const color = eventColors[event]
            return Box(
              { 
                paddingX: 1,
                backgroundColor: isSelected ? color : undefined,
              },
              Text({ 
                content: eventLabels[event], 
                fg: isSelected ? theme.base : theme.subtext0,
              })
            )
          })
        )
      ),
      
      // Section 3: Comments list
      Box(
        {
          flexDirection: "column",
          paddingX: 2,
          paddingY: 1,
          maxHeight: 16,
          overflow: "hidden",
        },
        Text({ 
          content: isFocused("comments") 
            ? `Comments (${includedCount}/${validComments.length}) - j/k navigate, space toggle`
            : `Comments (${includedCount}/${validComments.length})`, 
          fg: theme.subtext0,
        }),
        
        // Grouped by file
        validComments.length > 0 ? Box(
          { flexDirection: "column", marginTop: 1 },
          ...Array.from(groupedComments.entries()).flatMap(([filename, group]) => {
            // Truncate filename if too long (wider modal = more space)
            const displayName = filename.length > 70 
              ? "…" + filename.slice(-69) 
              : filename
            
            const fileHeader = Box(
              { marginTop: group === Array.from(groupedComments.values())[0] ? 0 : 1 },
              Text({ content: displayName, fg: theme.blue })
            )
            
            const commentRows = group.map(({ comment }) => {
              const globalIndex = flatCommentList.findIndex(vc => vc.comment.id === comment.id)
              const isExcluded = state.excludedCommentIds.has(comment.id)
              const isHighlighted = isFocused("comments") && globalIndex === state.highlightedIndex
              const marker = isExcluded ? " " : "✓"
              
              // Extract code context from diff hunk
              const contextLines = extractContextLines(comment.diffHunk, 2)
              const hasContext = contextLines.length > 0
              
              // Get first 2 lines of comment body (strip markdown for cleaner display)
              const maxLineLen = 66
              const cleanBody = stripMarkdown(comment.body)
              const lines = cleanBody.split("\n").filter(l => l.trim()).slice(0, 2)
              const bodyPreview = lines.map(line => {
                const truncated = line.length > maxLineLen ? line.slice(0, maxLineLen - 1) + "…" : line
                return truncated
              })
              
              // Layout: marker on left, content (context + comment) on right
              return Box(
                { 
                  flexDirection: "row",
                  marginTop: 1,
                  backgroundColor: isHighlighted ? highlightBg : undefined,
                },
                // Left column: marker (spans full height)
                Box(
                  { 
                    flexDirection: "column",
                    width: 2,
                  },
                  Text({ 
                    content: marker, 
                    fg: isExcluded ? theme.overlay0 : theme.green,
                  })
                ),
                // Right column: context + comment body
                Box(
                  { 
                    flexDirection: "column",
                    flexGrow: 1,
                  },
                  // Code context block (if available)
                  hasContext ? Box(
                    {
                      flexDirection: "column",
                      backgroundColor: theme.surface0,
                      paddingX: 1,
                    },
                    ...contextLines.map(line => 
                      Text({ 
                        content: line.length > maxLineLen ? line.slice(0, maxLineLen - 1) + "…" : line, 
                        fg: isExcluded ? theme.overlay0 : getDiffLineColor(line),
                      })
                    )
                  ) : null,
                  // Line number (only if no context)
                  !hasContext ? Text({ 
                    content: `:${comment.line}`, 
                    fg: isExcluded ? theme.overlay0 : theme.yellow,
                  }) : null,
                  // Comment body
                  Text({ 
                    content: bodyPreview[0] || "", 
                    fg: isExcluded ? theme.overlay0 : theme.text,
                  }),
                  // Second line of comment body
                  bodyPreview[1] ? Text({ 
                    content: bodyPreview[1], 
                    fg: isExcluded ? theme.overlay0 : theme.subtext0,
                  }) : null
                )
              )
            })
            
            return [fileHeader, ...commentRows]
          })
        ) : Box(
          { marginTop: 1 },
          Text({ content: "No comments to submit", fg: theme.overlay0 })
        ),
        
        // Invalid/skipped comments
        invalidComments.length > 0 ? Box(
          { flexDirection: "column", marginTop: 1 },
          Text({ content: `Skipped (${invalidComments.length}) - not in diff`, fg: theme.overlay0 }),
          ...invalidComments.slice(0, 2).map(({ comment }) => {
            const location = `${comment.filename}:${comment.line}`
            const truncLoc = location.length > 45 ? "…" + location.slice(-44) : location
            return Box(
              { marginLeft: 2 },
              Text({ content: `✗ ${truncLoc}`, fg: theme.overlay0 })
            )
          }),
          invalidComments.length > 2 ? Box(
            { marginLeft: 2 },
            Text({ content: `  +${invalidComments.length - 2} more`, fg: theme.overlay0 })
          ) : null
        ) : null
      ),
      
      // Section 4: Submit button with inline validation/error message
      Box(
        {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingX: 2,
          paddingY: 1,
        },
        // Validation/error message on left
        state.loading 
          ? Text({ content: "Submitting...", fg: theme.yellow })
          : state.error 
            ? Text({ content: state.error, fg: theme.red })
            : validation 
              ? Text({ 
                  content: validation.message, 
                  fg: validation.type === "error" ? theme.red : validation.type === "warning" ? theme.yellow : theme.blue,
                })
              : Text({ content: "", fg: theme.overlay0 }), // Empty placeholder to keep layout stable
        // Submit button on right
        Box(
          {
            paddingX: 2,
            paddingY: 0,
            backgroundColor: isFocused("submit") 
              ? (submitAllowed ? eventColors[state.selectedEvent] : theme.overlay0)
              : theme.surface1,
          },
          Text({ 
            content: "Submit Review", 
            fg: isFocused("submit") 
              ? (submitAllowed ? theme.base : theme.surface0)
              : (submitAllowed ? theme.text : theme.overlay0),
          })
        )
      )
    )
  )
}

// Re-export canSubmit for use in app.ts
export { canSubmit }
