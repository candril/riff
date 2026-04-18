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
import {
  closePRInfoPanel,
  showToast,
  clearToast,
  openPRCommentInput,
  closePRCommentInput,
  setPRCommentInputText,
  setPRCommentInputLoading,
  setPRCommentInputError,
} from "../../state"
import { submitPrComment } from "../../providers/github"

// Key sequence state for multi-key commands (e.g., "gg" for go to top)
let pendingKey: string | null = null
let pendingTimeout: ReturnType<typeof setTimeout> | null = null

function clearPendingKey(): void {
  pendingKey = null
  if (pendingTimeout) {
    clearTimeout(pendingTimeout)
    pendingTimeout = null
  }
}

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
  if (ctx.state.viewMode !== "pr") {
    return false
  }

  // When the tree sidebar has focus (spec 041: the tree is visible
  // alongside the PR view), let tree key handling run — except for the
  // sub-modal below, which always wins.
  if (!ctx.state.prInfoPanel.commentInputOpen && ctx.state.focusedPanel === "tree") {
    return false
  }

  // Handle PR comment input mode (sub-modal within the PR view)
  if (ctx.state.prInfoPanel.commentInputOpen) {
    handleCommentInput(key, ctx)
    return true
  }

  const panel = ctx.getPanel()

  switch (key.name) {
    case "i":
      // i toggles back to diff view (spec 041).
      ctx.setState(closePRInfoPanel)
      ctx.render()
      return true

    case "tab":
      // Tab cycles pr → diff → comments (handled by global toggleViewMode).
      return false

    case "c":
      // 'c' in conversation section opens comment input
      if (panel && panel.getActiveSection() === 'conversation' && ctx.state.prInfo) {
        ctx.setState(openPRCommentInput)
        ctx.render()
      }
      return true

    case "l":
      // l: expand selected conversation item
      if (panel && panel.getActiveSection() === 'conversation') {
        panel.expandSelectedThread()
      }
      ctx.render()
      return true

    case "h":
      // h: collapse selected conversation item
      if (panel && panel.getActiveSection() === 'conversation') {
        panel.collapseSelectedThread()
      }
      ctx.render()
      return true

    case "z":
      // Fold commands: za, zm, zr, zM, zR
      // We need to capture the next key for these
      // For now, handle single-key variants
      return true

    case "a":
      // za - toggle current section or thread/comment
      if (panel) {
        if (panel.isOnSectionHeader()) {
          // On section header: toggle section expand/collapse
          panel.toggleSection()
        } else {
          const section = panel.getActiveSection()
          if (section === 'conversation') {
            // On conversation item: toggle thread/comment expand
            panel.toggleSelectedThread()
          } else {
            // On other items: toggle section
            panel.toggleSection()
          }
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
          case 'checks': {
            // Open check details URL in browser
            const check = panel.getSelectedCheck()
            if (check?.detailsUrl) {
              Bun.spawn(["open", check.detailsUrl])
            }
            break
          }
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
              // PR comment or review header (no code location) - toggle expand
              panel.toggleSelectedThread()
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
          case 'checks': {
            const check = panel.getSelectedCheck()
            if (check?.detailsUrl) {
              Bun.spawn(["open", check.detailsUrl])
            }
            break
          }
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
            if (item && item.type !== 'pending-reviewer') {
              // Get URL - for PR comments use direct url, for reviews use first thread's url
              const url = item.type === 'pr-comment' 
                ? item.data.url 
                : item.data.threads[0]?.url
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
            case 'checks': {
              const check = panel.getSelectedCheck()
              if (check?.detailsUrl) {
                Bun.spawn(["sh", "-c", `echo -n "${check.detailsUrl}" | pbcopy`])
                ctx.setState((s) => showToast(s, `Copied ${check.name} URL`, "success"))
                copied = true
              }
              break
            }
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
              if (item && item.type !== 'pending-reviewer') {
                // Get body - for PR comments use direct body, for reviews use body or first thread body
                const body = item.type === 'pr-comment' 
                  ? item.data.body 
                  : (item.data.body || item.data.threads[0]?.body || '')
                if (body) {
                  Bun.spawn(["sh", "-c", `echo -n "${body.replace(/"/g, '\\"')}" | pbcopy`])
                  ctx.setState((s) => showToast(s, "Comment copied", "success"))
                  copied = true
                }
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
        if (panel.isSectionExpanded()) {
          // Try to move within section (header -> items -> next section)
          const moved = panel.moveCursor(1)
          if (!moved) {
            // At end of items, go to next section header
            panel.cycleSection(1)
          }
        } else {
          // Section collapsed, go to next section
          panel.cycleSection(1)
        }
      }
      return true

    case "k":
    case "up":
      if (panel) {
        if (panel.isSectionExpanded()) {
          // Try to move within section (items -> header -> prev section)
          const moved = panel.moveCursor(-1)
          if (!moved) {
            // At header, go to previous section (at its last item or header)
            panel.cycleSectionToEnd(-1)
          }
        } else {
          // Section collapsed, go to previous section
          panel.cycleSectionToEnd(-1)
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
      if (key.shift) {
        // G = scroll to bottom
        if (panel) {
          panel.getScrollBox().scrollTo(panel.getScrollBox().scrollHeight)
        }
        return true
      }
      // Start key sequence for g-prefixed commands
      pendingKey = "g"
      pendingTimeout = setTimeout(clearPendingKey, 500)
      return true
    }

  }

  // Handle second key of g-sequence (for gg)
  if (pendingKey === "g" && key.name === "g") {
    clearPendingKey()
    if (panel) {
      panel.getScrollBox().scrollTo(0)
    }
    return true
  }

  // Clear pending key on any other input
  if (pendingKey) {
    clearPendingKey()
  }

  // Let truly global keys fall through (spec 041):
  //  - q / escape (quit / toast-clear)
  //  - Ctrl+P action menu, Ctrl+F file picker, Ctrl+B tree toggle,
  //    Ctrl+E tree expand, Ctrl+L exit-tree, Ctrl+G file-path toast.
  if (key.name === "q" || key.name === "escape") {
    return false
  }
  if (key.ctrl && (key.name === "p" || key.name === "f" || key.name === "b" || key.name === "e" || key.name === "l" || key.name === "g")) {
    return false
  }

  // Capture all other keys while in PR view
  return true
}

/**
 * Handle input when PR comment input is open
 */
function handleCommentInput(
  key: KeyEvent,
  ctx: PRInfoPanelInputContext
): void {
  const { prInfoPanel, prInfo } = ctx.state
  
  switch (key.name) {
    case "escape":
      ctx.setState(closePRCommentInput)
      ctx.render()
      return

    case "return":
    case "enter":
      // Enter to submit
      if (prInfoPanel.commentInputText.trim() && prInfo) {
        ctx.setState(s => setPRCommentInputLoading(s, true))
        ctx.render()
        
        // Submit async
        submitPrComment(
          prInfo.owner,
          prInfo.repo,
          prInfo.number,
          prInfoPanel.commentInputText.trim()
        ).then(result => {
          if (result.success) {
            ctx.setState(s => {
              const closed = closePRCommentInput(s)
              return showToast(closed, "Comment posted", "success")
            })
            ctx.render()
            setTimeout(() => {
              ctx.setState(clearToast)
              ctx.render()
            }, 2000)
          } else {
            ctx.setState(s => setPRCommentInputError(s, result.error ?? "Failed to post comment"))
            ctx.render()
          }
        })
      }
      return

    case "backspace":
      if (prInfoPanel.commentInputText.length > 0) {
        ctx.setState(s => setPRCommentInputText(s, s.prInfoPanel.commentInputText.slice(0, -1)))
        ctx.render()
      }
      return

    default:
      // Add character to input
      if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
        ctx.setState(s => setPRCommentInputText(s, s.prInfoPanel.commentInputText + key.sequence))
        ctx.render()
      } else if (key.name === "j" && key.ctrl) {
        // Ctrl+j for newline
        ctx.setState(s => setPRCommentInputText(s, s.prInfoPanel.commentInputText + "\n"))
        ctx.render()
      }
      return
  }
}
