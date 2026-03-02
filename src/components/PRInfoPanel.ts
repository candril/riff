/**
 * PR Info Panel - Shows PR metadata at a glance (full screen)
 * Class-based component for efficient cursor updates
 */

import {
  BoxRenderable,
  TextRenderable,
  ScrollBoxRenderable,
  type CliRenderer,
} from "@opentui/core"
import type { PrInfo, PrReview, PrCommit } from "../providers/github"
import { colors, theme } from "../theme"

/**
 * Format a relative time string
 */
function formatTimeAgo(isoDate: string): string {
  const date = new Date(isoDate)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return "just now"
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
  return date.toLocaleDateString()
}

/**
 * Format a date/time for commits
 */
function formatDateTime(isoDate: string): string {
  const date = new Date(isoDate)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  
  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } else if (diffDays < 7) {
    return `${diffDays}d ago`
  } else {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }
}

/**
 * Get status color and label
 */
function getStatusInfo(state: PrInfo["state"], isDraft?: boolean): { label: string; color: string } {
  if (isDraft) {
    return { label: "Draft", color: theme.overlay1 }
  }
  switch (state) {
    case "open":
      return { label: "Open", color: theme.green }
    case "closed":
      return { label: "Closed", color: theme.red }
    case "merged":
      return { label: "Merged", color: theme.mauve }
  }
}

/**
 * Get review state icon and color
 */
function getReviewIcon(state: PrReview["state"]): { icon: string; color: string } {
  switch (state) {
    case "APPROVED":
      return { icon: "✓", color: theme.green }
    case "CHANGES_REQUESTED":
      return { icon: "✗", color: theme.red }
    case "COMMENTED":
      return { icon: "○", color: theme.subtext0 }
    case "PENDING":
      return { icon: "○", color: theme.yellow }
    case "DISMISSED":
      return { icon: "─", color: theme.overlay0 }
  }
}

/**
 * Truncate string to max length with ellipsis
 */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen - 1) + "…"
}

/**
 * Commit row references for selection updates
 */
interface CommitRowRefs {
  container: BoxRenderable
  sha: TextRenderable
  message: TextRenderable
}

/**
 * PR Info Panel - class-based for efficient updates
 */
export class PRInfoPanelClass {
  private renderer: CliRenderer
  private container: BoxRenderable
  private scrollBox: ScrollBoxRenderable
  private commitRows: CommitRowRefs[] = []
  private cursorIndex: number = 0
  private prInfo: PrInfo

  constructor(renderer: CliRenderer, prInfo: PrInfo) {
    this.renderer = renderer
    this.prInfo = prInfo
    
    // Build the panel
    const { container, scrollBox } = this.build()
    this.container = container
    this.scrollBox = scrollBox
  }

  /**
   * Get the container element
   */
  getContainer(): BoxRenderable {
    return this.container
  }

  /**
   * Get the scroll box for external scrolling
   */
  getScrollBox(): ScrollBoxRenderable {
    return this.scrollBox
  }

  /**
   * Get the current cursor index
   */
  getCursorIndex(): number {
    return this.cursorIndex
  }

  /**
   * Get the max cursor index (number of commits - 1)
   */
  getMaxCursorIndex(): number {
    return Math.max(0, (this.prInfo.commits?.length ?? 1) - 1)
  }

  /**
   * Move cursor and update visuals
   */
  moveCursor(delta: number): void {
    const maxIndex = this.getMaxCursorIndex()
    const newIndex = Math.max(0, Math.min(maxIndex, this.cursorIndex + delta))
    
    if (newIndex === this.cursorIndex) return
    
    // Update old row (deselect)
    this.updateCommitRow(this.cursorIndex, false)
    
    // Update new row (select)
    this.cursorIndex = newIndex
    this.updateCommitRow(this.cursorIndex, true)
  }

  /**
   * Get selected commit
   */
  getSelectedCommit(): PrCommit | undefined {
    return this.prInfo.commits?.[this.cursorIndex]
  }

  /**
   * Update a commit row's visual state
   */
  private updateCommitRow(index: number, selected: boolean): void {
    const row = this.commitRows[index]
    if (!row) return

    row.container.backgroundColor = selected ? theme.surface1 : undefined
    row.sha.fg = selected ? theme.peach : theme.yellow
    row.message.fg = selected ? theme.text : theme.subtext1
  }

  /**
   * Build the panel
   */
  private build(): { container: BoxRenderable; scrollBox: ScrollBoxRenderable } {
    const prInfo = this.prInfo
    const statusInfo = getStatusInfo(prInfo.state, prInfo.isDraft)
    
    // Build description lines (wrap at ~70 chars)
    const descriptionLines: string[] = []
    if (prInfo.body) {
      const paragraphs = prInfo.body.split(/\n/)
      for (const para of paragraphs) {
        if (para.trim() === "") {
          descriptionLines.push("")
          continue
        }
        const words = para.split(/\s+/)
        let currentLine = ""
        for (const word of words) {
          if (currentLine.length + word.length + 1 > 70) {
            descriptionLines.push(currentLine)
            currentLine = word
          } else {
            currentLine = currentLine ? `${currentLine} ${word}` : word
          }
        }
        if (currentLine) descriptionLines.push(currentLine)
      }
    }

    const commitCount = prInfo.commits?.length ?? 0
    const reviews = prInfo.reviews ?? []
    const requestedReviewers = prInfo.requestedReviewers ?? []
    const reviewedBy = reviews.filter(r => r.state !== "PENDING")
    const pendingReviewers = requestedReviewers.filter(
      r => !reviews.some(rev => rev.author === r)
    )

    // Find max username length for alignment
    const allUsernames = [
      ...reviewedBy.map(r => r.author),
      ...pendingReviewers
    ]
    const maxUsernameLen = Math.min(25, Math.max(15, ...allUsernames.map(u => u.length + 1)))

    // Main container
    const container = new BoxRenderable(this.renderer, {
      id: "pr-info-panel",
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      flexDirection: "column",
      backgroundColor: theme.base,
    })

    // Header
    const header = new BoxRenderable(this.renderer, {
      height: 1,
      width: "100%",
      backgroundColor: theme.mantle,
      paddingLeft: 1,
      flexDirection: "row",
      justifyContent: "space-between",
    })
    header.add(new TextRenderable(this.renderer, { content: "PR Info", fg: colors.primary }))
    header.add(new TextRenderable(this.renderer, { content: "Esc to close ", fg: theme.overlay0 }))
    container.add(header)

    // Scroll box
    const scrollBox = new ScrollBoxRenderable(this.renderer, {
      id: "pr-info-scroll",
      flexGrow: 1,
      width: "100%",
      paddingLeft: 2,
      paddingRight: 2,
      paddingTop: 1,
      scrollY: true,
    })
    container.add(scrollBox)

    // Content container inside scroll box
    const content = new BoxRenderable(this.renderer, {
      flexDirection: "column",
      width: "100%",
    })
    scrollBox.add(content)

    // Title
    content.add(new TextRenderable(this.renderer, { content: prInfo.title, fg: colors.text }))

    // Separator
    const separator = new BoxRenderable(this.renderer, { height: 1, width: "100%", marginTop: 1 })
    separator.add(new TextRenderable(this.renderer, { content: "─".repeat(70), fg: theme.surface1 }))
    content.add(separator)

    // Basic info section
    const basicInfo = new BoxRenderable(this.renderer, { flexDirection: "column", width: "100%", marginTop: 1 })
    content.add(basicInfo)

    // Status row
    const statusRow = new BoxRenderable(this.renderer, { flexDirection: "row", height: 1 })
    statusRow.add(new TextRenderable(this.renderer, { content: "Status".padEnd(12), fg: theme.overlay0 }))
    statusRow.add(new TextRenderable(this.renderer, { content: statusInfo.label, fg: statusInfo.color }))
    basicInfo.add(statusRow)

    // Author row
    const authorRow = new BoxRenderable(this.renderer, { flexDirection: "row", height: 1 })
    authorRow.add(new TextRenderable(this.renderer, { content: "Author".padEnd(12), fg: theme.overlay0 }))
    authorRow.add(new TextRenderable(this.renderer, { content: `@${prInfo.author}`, fg: theme.blue }))
    basicInfo.add(authorRow)

    // Branch row
    const branchRow = new BoxRenderable(this.renderer, { flexDirection: "row", height: 1 })
    branchRow.add(new TextRenderable(this.renderer, { content: "Branch".padEnd(12), fg: theme.overlay0 }))
    branchRow.add(new TextRenderable(this.renderer, { content: `${prInfo.headRef} → ${prInfo.baseRef}`, fg: theme.text }))
    basicInfo.add(branchRow)

    // Changes row
    const changesRow = new BoxRenderable(this.renderer, { flexDirection: "row", height: 1 })
    changesRow.add(new TextRenderable(this.renderer, { content: "Changes".padEnd(12), fg: theme.overlay0 }))
    changesRow.add(new TextRenderable(this.renderer, { content: `+${prInfo.additions}`, fg: theme.green }))
    changesRow.add(new TextRenderable(this.renderer, { content: ` -${prInfo.deletions}`, fg: theme.red }))
    changesRow.add(new TextRenderable(this.renderer, { content: ` (${prInfo.changedFiles} files)`, fg: theme.subtext0 }))
    basicInfo.add(changesRow)

    // Commits count row
    const commitsRow = new BoxRenderable(this.renderer, { flexDirection: "row", height: 1 })
    commitsRow.add(new TextRenderable(this.renderer, { content: "Commits".padEnd(12), fg: theme.overlay0 }))
    commitsRow.add(new TextRenderable(this.renderer, { content: String(commitCount), fg: theme.text }))
    basicInfo.add(commitsRow)

    // Created row
    if (prInfo.createdAt) {
      const createdRow = new BoxRenderable(this.renderer, { flexDirection: "row", height: 1 })
      createdRow.add(new TextRenderable(this.renderer, { content: "Created".padEnd(12), fg: theme.overlay0 }))
      createdRow.add(new TextRenderable(this.renderer, { content: formatTimeAgo(prInfo.createdAt), fg: theme.subtext0 }))
      basicInfo.add(createdRow)
    }

    // Updated row
    if (prInfo.updatedAt) {
      const updatedRow = new BoxRenderable(this.renderer, { flexDirection: "row", height: 1 })
      updatedRow.add(new TextRenderable(this.renderer, { content: "Updated".padEnd(12), fg: theme.overlay0 }))
      updatedRow.add(new TextRenderable(this.renderer, { content: formatTimeAgo(prInfo.updatedAt), fg: theme.subtext0 }))
      basicInfo.add(updatedRow)
    }

    // Reviews section
    if (reviewedBy.length > 0 || pendingReviewers.length > 0) {
      const reviewsSection = new BoxRenderable(this.renderer, { flexDirection: "column", width: "100%", marginTop: 1 })
      reviewsSection.add(new TextRenderable(this.renderer, { content: "Reviews", fg: theme.overlay0 }))
      
      const reviewsList = new BoxRenderable(this.renderer, { flexDirection: "column", width: "100%", marginTop: 1 })
      reviewsSection.add(reviewsList)
      
      for (const review of reviewedBy) {
        const { icon, color } = getReviewIcon(review.state)
        const stateLabel = review.state === "CHANGES_REQUESTED" 
          ? "changes requested" 
          : review.state.toLowerCase()
        
        const reviewRow = new BoxRenderable(this.renderer, { flexDirection: "row", height: 1 })
        reviewRow.add(new TextRenderable(this.renderer, { content: `${icon} `, fg: color }))
        reviewRow.add(new TextRenderable(this.renderer, { content: `@${review.author}`.padEnd(maxUsernameLen), fg: theme.text }))
        reviewRow.add(new TextRenderable(this.renderer, { content: stateLabel, fg: theme.subtext0 }))
        reviewsList.add(reviewRow)
      }
      
      for (const reviewer of pendingReviewers) {
        const pendingRow = new BoxRenderable(this.renderer, { flexDirection: "row", height: 1 })
        pendingRow.add(new TextRenderable(this.renderer, { content: "○ ", fg: theme.yellow }))
        pendingRow.add(new TextRenderable(this.renderer, { content: `@${reviewer}`.padEnd(maxUsernameLen), fg: theme.text }))
        pendingRow.add(new TextRenderable(this.renderer, { content: "awaiting review", fg: theme.yellow }))
        reviewsList.add(pendingRow)
      }
      
      content.add(reviewsSection)
    }

    // Commits section
    if (prInfo.commits && prInfo.commits.length > 0) {
      const commitsSection = new BoxRenderable(this.renderer, { flexDirection: "column", width: "100%", marginTop: 1 })
      commitsSection.add(new TextRenderable(this.renderer, { content: `Commits (${prInfo.commits.length})`, fg: theme.overlay0 }))
      
      const commitsList = new BoxRenderable(this.renderer, { flexDirection: "column", width: "100%", marginTop: 1 })
      commitsSection.add(commitsList)
      
      for (let i = 0; i < Math.min(20, prInfo.commits.length); i++) {
        const commit = prInfo.commits[i]!
        const isSelected = i === 0 // First one is selected initially
        
        const commitRow = new BoxRenderable(this.renderer, {
          id: `commit-${i}`,
          flexDirection: "row",
          height: 1,
          backgroundColor: isSelected ? theme.surface1 : undefined,
        })
        
        const shaText = new TextRenderable(this.renderer, { content: commit.sha.padEnd(9), fg: isSelected ? theme.peach : theme.yellow })
        const messageText = new TextRenderable(this.renderer, { content: truncate(commit.message, 50).padEnd(52), fg: isSelected ? theme.text : theme.subtext1 })
        const dateText = new TextRenderable(this.renderer, { content: formatDateTime(commit.date), fg: theme.subtext0 })
        
        commitRow.add(shaText)
        commitRow.add(messageText)
        commitRow.add(dateText)
        commitsList.add(commitRow)
        
        // Store references for selection updates
        this.commitRows.push({
          container: commitRow,
          sha: shaText,
          message: messageText,
        })
      }
      
      if (prInfo.commits.length > 20) {
        commitsList.add(new TextRenderable(this.renderer, { 
          content: `... +${prInfo.commits.length - 20} more`, 
          fg: theme.overlay0 
        }))
      }
      
      content.add(commitsSection)
    }

    // Description section
    if (prInfo.body && descriptionLines.length > 0) {
      const descSection = new BoxRenderable(this.renderer, { flexDirection: "column", width: "100%", marginTop: 1 })
      descSection.add(new TextRenderable(this.renderer, { content: "Description", fg: theme.overlay0 }))
      
      const descContent = new BoxRenderable(this.renderer, { flexDirection: "column", width: "100%", marginTop: 1 })
      descSection.add(descContent)
      
      for (let i = 0; i < Math.min(20, descriptionLines.length); i++) {
        descContent.add(new TextRenderable(this.renderer, { content: descriptionLines[i] || " ", fg: theme.subtext1 }))
      }
      
      if (descriptionLines.length > 20) {
        descContent.add(new TextRenderable(this.renderer, { 
          content: `... +${descriptionLines.length - 20} more lines`, 
          fg: theme.overlay0 
        }))
      }
      
      content.add(descSection)
    }

    // Footer
    const footer = new BoxRenderable(this.renderer, {
      height: 1,
      width: "100%",
      backgroundColor: theme.mantle,
      paddingLeft: 2,
      flexDirection: "row",
    })
    footer.add(new TextRenderable(this.renderer, { content: "j/k ", fg: theme.yellow }))
    footer.add(new TextRenderable(this.renderer, { content: "select  ", fg: theme.subtext0 }))
    footer.add(new TextRenderable(this.renderer, { content: "y ", fg: theme.yellow }))
    footer.add(new TextRenderable(this.renderer, { content: "copy SHA  ", fg: theme.subtext0 }))
    footer.add(new TextRenderable(this.renderer, { content: "Y ", fg: theme.yellow }))
    footer.add(new TextRenderable(this.renderer, { content: "copy URL  ", fg: theme.subtext0 }))
    footer.add(new TextRenderable(this.renderer, { content: "o ", fg: theme.yellow }))
    footer.add(new TextRenderable(this.renderer, { content: "open", fg: theme.subtext0 }))
    container.add(footer)

    return { container, scrollBox }
  }

  /**
   * Destroy the panel
   */
  destroy(): void {
    if (this.container.parent) {
      this.container.parent.remove(this.container.id)
    }
  }
}
