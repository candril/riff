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
  clearViewFilter,
  commitViewFilter,
  closePRInfoPanel,
  showToast,
  clearToast,
  openPRCommentInput,
  closePRCommentInput,
  setPRCommentInputText,
  setPRCommentInputLoading,
  setPRCommentInputError,
  setReactionTarget,
} from "../../state"
import { submitPrComment } from "../../providers/github"
import { copyToClipboard } from "../../utils/clipboard"

// Key sequence state for multi-key commands (e.g., "gg" for go to top)
let pendingKey: string | null = null
let pendingTimeout: ReturnType<typeof setTimeout> | null = null

/**
 * The key handler is synchronous, so the copy runs detached. The toast waits
 * for the helper to exit rather than firing optimistically: a "copied" toast
 * over an empty clipboard is worse than a late one.
 */
function copyAndToast(
  ctx: PRInfoPanelInputContext,
  text: string,
  message: string,
): void {
  void copyToClipboard(text).then((copied) => {
    ctx.setState((s) =>
      copied.ok
        ? showToast(s, message, "success")
        : showToast(s, `Copy failed: ${copied.error}`, "error"),
    )
    ctx.render()
    setTimeout(() => {
      ctx.setState(clearToast)
      ctx.render()
    }, 2000)
  })
}

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
  // Callback to open a specific file at a specific line in $EDITOR,
  // bypassing the diff view (spec 043). Used for check annotations —
  // the file may not even be in the PR diff.
  onOpenFileAtLine?: (filename: string, line: number) => void
  // Callback to activate a commit (for commits section Enter)
  onActivateCommit?: (sha: string) => void
  // Toggle resolved state of a review thread by root comment id.
  // Used by `x` in the Conversation section.
  onToggleThreadResolved?: (rootCommentId: string) => void
  // Open the inline comment overlay (the thread view) on a review thread,
  // identified by its root comment id. Enter in the Conversation section
  // uses this so a thread opens the same surface here as it does from the
  // diff and from the comments picker.
  onOpenThread?: (rootCommentId: string) => void
  // Dispatch a global action by id. Used so chord shortcuts like `gr`
  // (refresh), `go` (open in browser), `gy` (copy PR URL) work inside the
  // panel even though the panel captures `r`/`o`/`y` standalone for its
  // own section-scoped semantics.
  executeAction?: (id: string) => void
  // Push current location onto the jumplist before navigating away (spec
  // 038). Called BEFORE closePRInfoPanel so the entry captures
  // viewMode="pr" — otherwise back-jump can't return to the PR view.
  recordJump?: () => void
}

/**
 * Handle input when PR info panel is open.
 * Returns true if the key was handled (panel is open), false otherwise.
 */
export function handleInput(
  key: KeyEvent,
  ctx: PRInfoPanelInputContext
): boolean {
  const handled = handleInputInner(key, ctx)
  // After every consumed key, sync state.reactionTarget to whatever the
  // panel is focused on now — keeps Ctrl+p → React… targeting the
  // visually-focused item (spec 042).
  if (handled) syncReactionTarget(ctx)
  return handled
}

function handleInputInner(
  key: KeyEvent,
  ctx: PRInfoPanelInputContext
): boolean {
  if (ctx.state.viewMode !== "state") {
    return false
  }

  // The `Ctrl-f` prompt owns every key while it is open; only the two that
  // mean something to riff are taken, and the rest reach the input widget
  // (spec 065).
  if (ctx.state.prInfoPanel.filterInput) {
    if (key.name === "escape") {
      key.preventDefault()
      ctx.setState(clearViewFilter)
      ctx.render()
    } else if (key.name === "return" || key.name === "enter") {
      key.preventDefault()
      ctx.setState(commitViewFilter)
      ctx.render()
    }
    return true
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

  // Ctrl-modified keys never match the section-scoped letter handlers
  // below — fall through so Ctrl-O (jumplist back), Ctrl-I (forward),
  // Ctrl-P (palette), etc. reach the global handler. Without this guard
  // Ctrl-O would hit `case "o":` and trigger "open in browser" (spec 038).
  if (key.ctrl) {
    return false
  }

  if (pendingKey === "z") {
    clearPendingKey()
    if (!panel) return true
    switch (key.name) {
      case "a":
        // Toggle the section, or the thread / check the cursor is on.
        if (panel.isOnSectionHeader()) {
          panel.toggleSection()
        } else {
          const section = panel.getActiveSection()
          if (section === 'conversation') {
            panel.toggleSelectedThread()
          } else if (section === 'checks') {
            const check = panel.getSelectedCheck()
            if (check) panel.toggleCheckExpansion(check.id)
          } else {
            panel.toggleSection()
          }
        }
        return true
      case "m":
        if (key.shift) panel.collapseAllSections()
        else panel.collapseSection()
        return true
      case "r":
        if (key.shift) panel.expandAllSections()
        else panel.expandSection()
        return true
    }
    return true
  }

  // Resolve `g`-prefixed chords before the switch so the panel's standalone
  // `r`/`o`/`y` handlers (expand-section / open-focused / copy-focused)
  // don't swallow the chord key.
  if (pendingKey === "g") {
    clearPendingKey()
    switch (key.name) {
      case "g":
        if (panel) panel.getScrollBox().scrollTo(0)
        return true
      case "r":
        ctx.executeAction?.("refresh")
        return true
      case "o":
        ctx.executeAction?.("open-in-browser")
        return true
      case "y":
        ctx.executeAction?.("copy-pr-url")
        return true
    }
    // Unknown g-sequence: swallow to avoid accidentally falling through
    // into the panel-local `r`/`o`/`y`/etc. handlers below.
    return true
  }

  switch (key.name) {
    case "i":
      // Bare `i` is the view router's — it takes you back to wherever you
      // came from (spec 064).
      return false

    case "tab":
      // Tab now means jumplist forward (spec 038); falls through to the
      // global handler.
      return false

    case "c":
      // 'c' in conversation section opens comment input
      if (panel && panel.getActiveSection() === 'conversation' && ctx.state.prInfo) {
        ctx.setState(openPRCommentInput)
        ctx.render()
      }
      return true

    case "l":
      // l: expand selected item — conversation threads, or (spec 043)
      // failing checks into their annotation list.
      if (panel) {
        const section = panel.getActiveSection()
        if (section === 'conversation') panel.expandSelectedThread()
        else if (section === 'checks') panel.expandSelectedCheck()
      }
      ctx.render()
      return true

    case "h":
      // h: collapse selected item — conversation threads, or (spec 043)
      // expanded check annotation lists.
      if (panel) {
        const section = panel.getActiveSection()
        if (section === 'conversation') panel.collapseSelectedThread()
        else if (section === 'checks') panel.collapseSelectedCheck()
      }
      ctx.render()
      return true

    case "x": {
      // x: toggle resolved state of the focused review thread. Only
      // meaningful when a review-thread row is focused — pr-comment and
      // review-header don't have resolution state. The handler is a no-op
      // for anything else.
      if (!panel || panel.getActiveSection() !== 'conversation') return true
      const flat = panel.getSelectedFlatItem?.()
      if (!flat || flat.type !== 'review-thread') return true
      ctx.onToggleThreadResolved?.(flat.data.id)
      return true
    }

    case "z":
      // Fold commands: za, zm, zr, zM, zR — a real chord, so that the
      // letters they end in stay free for the keys that reach every view
      // (`a` is the feed, spec 064).
      pendingKey = "z"
      pendingTimeout = setTimeout(clearPendingKey, 500)
      return true

    case "return":
    case "enter":
      // Enter: action based on current section
      if (panel) {
        const section = panel.getActiveSection()
        switch (section) {
          case 'checks': {
            // Enter on an annotation opens the file at that line in
            // $EDITOR (spec 043). We deliberately don't route through
            // the diff view — error sites are often in code the PR
            // didn't touch, so the file isn't in `state.files`. Enter
            // on a failing check row toggles its annotation list
            // (same "no location → toggle expand" pattern conversation
            // uses); Enter on any other check row opens the browser.
            const ann = panel.getSelectedAnnotation()
            if (ann && ctx.onOpenFileAtLine) {
              // Don't close the panel — $EDITOR is external, and on
              // return the user wants to stay on the annotation they
              // just inspected (spec 043).
              ctx.onOpenFileAtLine(ann.annotation.path, ann.annotation.startLine)
              break
            }
            const check = panel.getSelectedCheck()
            if (check && panel.getSelectedAnnotation() === null) {
              if (check.status === "completed" && (
                check.conclusion === "failure" ||
                check.conclusion === "timed_out" ||
                check.conclusion === "action_required"
              )) {
                panel.toggleCheckExpansion(check.id)
                ctx.render()
                break
              }
            }
            if (check?.detailsUrl) {
              Bun.spawn(["open", check.detailsUrl])
            }
            break
          }
          case 'files': {
            const file = panel.getSelectedFile()
            if (file && ctx.onJumpToFile) {
              ctx.recordJump?.()
              ctx.setState(closePRInfoPanel)
              ctx.render()
              ctx.onJumpToFile(file.filename)
            }
            break
          }
          case 'commits': {
            const commit = panel.getSelectedCommit()
            if (commit && ctx.onActivateCommit) {
              ctx.recordJump?.()
              ctx.setState(closePRInfoPanel)
              ctx.render()
              ctx.onActivateCommit(commit.sha)
            }
            break
          }
          case 'conversation': {
            // Enter on a thread opens the thread view (the inline comment
            // overlay) on its anchor — same surface Enter gives on a
            // commented diff line and on a comments-picker hit.
            const flat = panel.getSelectedFlatItem?.()
            if (flat?.type === 'review-thread' && ctx.onOpenThread) {
              ctx.recordJump?.()
              ctx.setState(closePRInfoPanel)
              ctx.render()
              ctx.onOpenThread(flat.data.id)
              break
            }
            // Anything else (PR comment, review header, pending reviewers)
            // has no thread of its own — expand it in place. For a review
            // header that reveals its threads, which Enter then opens.
            panel.toggleSelectedThread()
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
            // `o` on an annotation prefers the raw log line URL; falls
            // back to the check's details URL (spec 043).
            const ann = panel.getSelectedAnnotation()
            if (ann) {
              const url = ann.annotation.rawDetailsUrl ?? ann.check.detailsUrl
              if (url) Bun.spawn(["open", url])
              break
            }
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
          copyAndToast(ctx, ctx.state.prInfo.url, "PR URL copied")
        } else {
          // y = copy based on section
          const section = panel.getActiveSection()
          let copied = false
          switch (section) {
            case 'checks': {
              // `y` on an annotation copies `path:line`; on a check row
              // copies the check's details URL (spec 043).
              const ann = panel.getSelectedAnnotation()
              if (ann) {
                const loc = `${ann.annotation.path}:${ann.annotation.startLine}`
                copyAndToast(ctx, loc, `Copied ${loc}`)
                copied = true
                break
              }
              const check = panel.getSelectedCheck()
              if (check?.detailsUrl) {
                copyAndToast(ctx, check.detailsUrl, `Copied ${check.name} URL`)
                copied = true
              }
              break
            }
            case 'commits': {
              const commit = panel.getSelectedCommit()
              if (commit) {
                copyAndToast(ctx, commit.sha, `Copied ${commit.sha}`)
                copied = true
              }
              break
            }
            case 'files': {
              const file = panel.getSelectedFile()
              if (file) {
                copyAndToast(ctx, file.filename, `Copied ${file.filename}`)
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
                  copyAndToast(ctx, body, "Comment copied")
                  copied = true
                }
              }
              break
            }
          }
          if (!copied) {
            // Default: copy PR URL
            copyAndToast(ctx, ctx.state.prInfo.url, "PR URL copied")
          }
        }
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
      // Ctrl+d pages down; bare `d` is the diff, and belongs to the view
      // router (spec 064).
      if (!key.ctrl) return false
      if (panel) panel.getScrollBox().scrollBy(10)
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

  // Let truly global keys fall through: q / escape (quit / toast-clear),
  // `tab` for jumplist forward (spec 038; terminal input collapses Ctrl-I
  // to Tab), `i` / `a` for the view router (spec 064) and `s` for flash
  // (spec 066). Ctrl-modified keys are already handled by the early-return
  // at the top of this function.
  if (
    key.name === "q" ||
    key.name === "escape" ||
    key.name === "tab" ||
    key.name === "i" ||
    key.name === "a" ||
    key.name === "s"
  ) {
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

/**
 * Pull the current reaction target from the panel and mirror it into
 * state (spec 042). Called after every consumed key so the palette's
 * React… entry targets whichever item is visually focused right now.
 */
function syncReactionTarget(ctx: PRInfoPanelInputContext): void {
  const panel = ctx.getPanel()
  const target = panel?.getReactionTarget?.() ?? null
  // setReactionTarget is identity-checked — it no-ops when the target
  // is the same, so we don't thrash renders on e.g. repeated `j`s that
  // land on the same item class.
  ctx.setState(s => setReactionTarget(s, target))
}
