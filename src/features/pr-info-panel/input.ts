/**
 * PR Info Panel input handling.
 *
 * The PR info panel captures all input when open. It displays PR details
 * with section-based navigation:
 * - Tab: cycle between sections
 * - j/k: navigate items within active section  
 * - za/zm/zr/zR/zM: fold controls
 * - Enter: action on selected item
 */

import type { KeyEvent } from "@opentui/core"
import type { AppState } from "../../state"
import type { PRInfoPanelClass } from "../../components"
import { closePRInfoPanel, showToast, clearToast } from "../../state"

export interface PRInfoPanelInputContext {
  readonly state: AppState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
  // The PR info panel class instance (for cursor movement and scrolling)
  getPanel: () => PRInfoPanelClass | null
  // Callback to jump to file (for files section Enter)
  onJumpToFile?: (filename: string) => void
  // Callback to jump to file:line (for conversation code comments)
  onJumpToLocation?: (filename: string, line: number) => void
  // Callback to activate a commit (for commits section Enter)
  onActivateCommit?: (sha: string) => void
}

/**
 * Handle input when PR info panel is open.
 * Returns true if the key was handled (panel is open), false otherwise.
 */
export function handleInput(
  key: KeyEvent,
  ctx: PRInfoPanelInputContext
): boolean {
  if (!ctx.state.prInfoPanel.open) {
    return false
  }

  const panel = ctx.getPanel()

  switch (key.name) {
    case "escape":
    case "q":
      ctx.setState(closePRInfoPanel)
      ctx.render()
      return true

    case "tab":
      // Tab/Shift+Tab to cycle sections
      if (panel) {
        const delta = key.shift ? -1 : 1
        panel.cycleSection(delta)
      }
      return true

    case "z":
      // Fold commands: za, zm, zr, zM, zR
      // We need to capture the next key for these
      // For now, handle single-key variants
      return true

    case "a":
      // za - toggle current section or thread
      if (panel) {
        const section = panel.getActiveSection()
        if (section === 'conversation') {
          // Toggle thread expand/collapse if on a thread
          panel.toggleSelectedThread()
        } else {
          // Toggle section expand/collapse
          panel.toggleSection()
        }
      }
      return true

    case "m":
      // zm/zM - collapse section(s)
      if (panel) {
        if (key.shift) {
          panel.collapseAllSections()
        } else {
          panel.collapseSection()
        }
      }
      return true

    case "r":
      // zr/zR - expand section(s)
      if (panel) {
        if (key.shift) {
          panel.expandAllSections()
        } else {
          panel.expandSection()
        }
      }
      return true

    case "return":
    case "enter":
      // Enter: action based on current section
      if (panel) {
        const section = panel.getActiveSection()
        switch (section) {
          case 'files': {
            const file = panel.getSelectedFile()
            if (file && ctx.onJumpToFile) {
              ctx.setState(closePRInfoPanel)
              ctx.render()
              ctx.onJumpToFile(file.filename)
            }
            break
          }
          case 'commits': {
            const commit = panel.getSelectedCommit()
            if (commit && ctx.onActivateCommit) {
              ctx.setState(closePRInfoPanel)
              ctx.render()
              ctx.onActivateCommit(commit.sha)
            }
            break
          }
          case 'conversation': {
            // Enter on conversation: jump to code location or open in browser
            const location = panel.getSelectedCommentLocation()
            if (location && ctx.onJumpToLocation) {
              ctx.setState(closePRInfoPanel)
              ctx.render()
              ctx.onJumpToLocation(location.filename, location.line)
            } else {
              // PR comment (no code location) - open in browser
              const item = panel.getSelectedConversationItem()
              if (item?.type === 'pr-comment' && item.data.url) {
                Bun.spawn(["open", item.data.url])
              }
            }
            break
          }
        }
      }
      return true

    case "o":
      // Open in browser based on current section/selection
      if (panel && ctx.state.prInfo) {
        const section = panel.getActiveSection()
        switch (section) {
          case 'commits': {
            const commit = panel.getSelectedCommit()
            if (commit) {
              const { owner, repo } = ctx.state.prInfo
              const url = `https://github.com/${owner}/${repo}/commit/${commit.sha}`
              Bun.spawn(["open", url])
            }
            break
          }
          case 'files': {
            const file = panel.getSelectedFile()
            if (file) {
              const { owner, repo, number } = ctx.state.prInfo
              const url = `https://github.com/${owner}/${repo}/pull/${number}/files#diff-${file.filename.replace(/\//g, '-')}`
              Bun.spawn(["open", url])
            }
            break
          }
          case 'conversation': {
            const item = panel.getSelectedConversationItem()
            if (item) {
              const url = item.type === 'pr-comment' ? item.data.url : item.data.url
              if (url) Bun.spawn(["open", url])
            }
            break
          }
          default:
            // Open PR itself
            Bun.spawn(["open", ctx.state.prInfo.url])
        }
      }
      return true

    case "y": {
      // y: Copy based on section, Y: Copy PR URL
      if (panel && ctx.state.prInfo) {
        if (key.shift) {
          // Y = copy PR URL
          Bun.spawn(["sh", "-c", `echo -n "${ctx.state.prInfo.url}" | pbcopy`])
          ctx.setState((s) => showToast(s, "PR URL copied", "success"))
        } else {
          // y = copy based on section
          const section = panel.getActiveSection()
          let copied = false
          switch (section) {
            case 'commits': {
              const commit = panel.getSelectedCommit()
              if (commit) {
                Bun.spawn(["sh", "-c", `echo -n "${commit.sha}" | pbcopy`])
                ctx.setState((s) => showToast(s, `Copied ${commit.sha}`, "success"))
                copied = true
              }
              break
            }
            case 'files': {
              const file = panel.getSelectedFile()
              if (file) {
                Bun.spawn(["sh", "-c", `echo -n "${file.filename}" | pbcopy`])
                ctx.setState((s) => showToast(s, `Copied ${file.filename}`, "success"))
                copied = true
              }
              break
            }
            case 'conversation': {
              const item = panel.getSelectedConversationItem()
              if (item) {
                const body = item.type === 'pr-comment' ? item.data.body : item.data.body
                Bun.spawn(["sh", "-c", `echo -n "${body.replace(/"/g, '\\"')}" | pbcopy`])
                ctx.setState((s) => showToast(s, "Comment copied", "success"))
                copied = true
              }
              break
            }
          }
          if (!copied) {
            // Default: copy PR URL
            Bun.spawn(["sh", "-c", `echo -n "${ctx.state.prInfo.url}" | pbcopy`])
            ctx.setState((s) => showToast(s, "PR URL copied", "success"))
          }
        }
        ctx.render()
        setTimeout(() => {
          ctx.setState(clearToast)
          ctx.render()
        }, 2000)
      }
      return true
    }

    case "j":
    case "down":
      if (panel) {
        const section = panel.getActiveSection()
        const hasItems = section === 'files' || section === 'commits' || section === 'conversation'
        
        if (panel.isSectionExpanded() && hasItems) {
          // Navigate within items if expanded and section has items
          const moved = panel.moveCursor(1)
          if (!moved) {
            // At end of items, go to next section
            panel.cycleSection(1)
          }
        } else {
          // Section collapsed or no items, go to next section
          panel.cycleSection(1)
        }
      }
      return true

    case "k":
    case "up":
      if (panel) {
        const section = panel.getActiveSection()
        const hasItems = section === 'files' || section === 'commits' || section === 'conversation'
        
        if (panel.isSectionExpanded() && hasItems) {
          // Navigate within items if expanded and section has items
          const moved = panel.moveCursor(-1)
          if (!moved) {
            // At start of items, go to previous section
            panel.cycleSection(-1)
          }
        } else {
          // Section collapsed or no items, go to previous section
          panel.cycleSection(-1)
        }
      }
      return true

    case "d":
      // Ctrl+d: page down
      if (key.ctrl && panel) {
        panel.getScrollBox().scrollBy(10)
      }
      return true

    case "u":
      // Ctrl+u: page up
      if (key.ctrl && panel) {
        panel.getScrollBox().scrollBy(-10)
      }
      return true

    case "g": {
      // gg: scroll to top, G: scroll to bottom
      if (panel) {
        const scrollBox = panel.getScrollBox()
        if (key.shift) {
          // G = scroll to bottom
          scrollBox.scrollTo(scrollBox.scrollHeight)
        } else {
          // g = scroll to top (simplified, no gg detection)
          scrollBox.scrollTo(0)
        }
      }
      return true
    }
  }

  // Capture all other keys when panel is open
  return true
}
