/**
 * SyncPreview - Modal for previewing and confirming sync operations
 * 
 * Shows:
 * - Edited comments (with diff of old vs new)
 * - Local replies to synced comments
 */

import { Box, Text } from "@opentui/core"
import { theme } from "../theme"
import type { Comment } from "../types"

/**
 * Item to be synced
 */
export interface SyncItem {
  type: "edit" | "reply" | "new"
  comment: Comment
  /** For edits: the new body to send */
  newBody?: string
  /** For replies: the parent comment */
  parent?: Comment
}

/**
 * Gather all items that need syncing
 */
export function gatherSyncItems(comments: Comment[]): SyncItem[] {
  const items: SyncItem[] = []
  
  for (const comment of comments) {
    // Edits: synced comments with localEdit
    if (comment.status === "synced" && comment.localEdit && comment.githubId) {
      items.push({
        type: "edit",
        comment,
        newBody: comment.localEdit,
      })
    }
    
    // Replies: local comments with inReplyTo pointing to a synced comment
    if (comment.status === "local" && comment.inReplyTo) {
      const parent = comments.find(c => c.id === comment.inReplyTo)
      if (parent?.githubId) {
        items.push({
          type: "reply",
          comment,
          parent,
        })
      }
    }
    
    // New: local top-level comments (not replies)
    if (comment.status === "local" && !comment.inReplyTo) {
      items.push({
        type: "new",
        comment,
      })
    }
  }
  
  return items
}

export interface SyncPreviewState {
  loading: boolean
  error: string | null
  /** Index of highlighted item for j/k navigation (P2 feature) */
  highlightedIndex: number
}

export function createSyncPreviewState(): SyncPreviewState {
  return {
    loading: false,
    error: null,
    highlightedIndex: 0,
  }
}

export interface SyncPreviewProps {
  items: SyncItem[]
  state: SyncPreviewState
}

/**
 * Truncate text to max length with ellipsis
 */
function truncate(text: string, maxLen: number): string {
  const singleLine = text.replace(/\n/g, " ").trim()
  if (singleLine.length <= maxLen) return singleLine
  return singleLine.slice(0, maxLen - 1) + "…"
}

/**
 * Get first line of text
 */
function firstLine(text: string, maxLen: number = 60): string {
  const line = text.split("\n")[0] || ""
  return truncate(line, maxLen)
}

/**
 * SyncPreview modal component
 */
export function SyncPreview({ items, state }: SyncPreviewProps) {
  const newComments = items.filter(i => i.type === "new")
  const edits = items.filter(i => i.type === "edit")
  const replies = items.filter(i => i.type === "reply")
  const totalCount = items.length
  
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
        Text({ content: "Sync Changes", fg: theme.text }),
        Text({ content: "esc", fg: theme.overlay0 })
      ),
      
      // Content
      Box(
        {
          flexDirection: "column",
          paddingX: 2,
          paddingY: 1,
          gap: 1,
        },
        
        // Empty state
        totalCount === 0 ? Box(
          { paddingY: 2 },
          Text({ content: "No changes to sync", fg: theme.overlay0 })
        ) : null,
        
        // New comments section
        newComments.length > 0 ? Box(
          { flexDirection: "column", gap: 1 },
          Text({ content: `New Comments (${newComments.length})`, fg: theme.subtext0 }),
          ...newComments.map(item => Box(
            {
              flexDirection: "column",
              backgroundColor: theme.surface0,
              paddingX: 1,
              paddingY: 1,
            },
            // Location
            Text({ 
              content: `${item.comment.filename}:${item.comment.line}`, 
              fg: theme.blue 
            }),
            // Comment content
            Box(
              { flexDirection: "row", gap: 1 },
              Text({ content: "+", fg: theme.green }),
              Text({ 
                content: firstLine(item.comment.body), 
                fg: theme.green 
              })
            )
          ))
        ) : null,
        
        // Edits section
        edits.length > 0 ? Box(
          { flexDirection: "column", gap: 1 },
          Text({ content: `Edits (${edits.length})`, fg: theme.subtext0 }),
          ...edits.map(item => Box(
            {
              flexDirection: "column",
              backgroundColor: theme.surface0,
              paddingX: 1,
              paddingY: 1,
            },
            // Location
            Text({ 
              content: `${item.comment.filename}:${item.comment.line}`, 
              fg: theme.blue 
            }),
            // Old value (what's on GitHub)
            Box(
              { flexDirection: "row", gap: 1 },
              Text({ content: "-", fg: theme.red }),
              Text({ 
                content: firstLine(item.comment.body), 
                fg: theme.red 
              })
            ),
            // New value (local edit)
            Box(
              { flexDirection: "row", gap: 1 },
              Text({ content: "+", fg: theme.green }),
              Text({ 
                content: firstLine(item.newBody || ""), 
                fg: theme.green 
              })
            )
          ))
        ) : null,
        
        // Replies section
        replies.length > 0 ? Box(
          { flexDirection: "column", gap: 1 },
          Text({ content: `Replies (${replies.length})`, fg: theme.subtext0 }),
          ...replies.map(item => Box(
            {
              flexDirection: "column",
              backgroundColor: theme.surface0,
              paddingX: 1,
              paddingY: 1,
            },
            // Location with reply indicator
            Box(
              { flexDirection: "row", gap: 1 },
              Text({ 
                content: `${item.comment.filename}:${item.comment.line}`, 
                fg: theme.blue 
              }),
              Text({ content: "→", fg: theme.overlay0 }),
              Text({ 
                content: `@${item.parent?.author || "unknown"}`, 
                fg: theme.lavender 
              })
            ),
            // Reply content
            Text({ 
              content: firstLine(item.comment.body), 
              fg: theme.text 
            })
          ))
        ) : null
      ),
      
      // Footer
      Box(
        {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingX: 2,
          paddingY: 1,
        },
        // Status/error message
        state.loading
          ? Text({ content: "Syncing...", fg: theme.yellow })
          : state.error
            ? Text({ content: state.error, fg: theme.red })
            : Text({ content: "", fg: theme.overlay0 }),
        // Action button
        totalCount > 0 ? Box(
          {
            paddingX: 2,
            backgroundColor: state.loading ? theme.overlay0 : theme.blue,
          },
          Text({
            content: `Sync ${totalCount} change${totalCount !== 1 ? "s" : ""}`,
            fg: state.loading ? theme.surface0 : theme.base,
          })
        ) : null
      )
    )
  )
}
