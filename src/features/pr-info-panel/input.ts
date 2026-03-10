/**
 * PR Info Panel input handling.
 *
 * The PR info panel captures all input when open. It displays PR details,
 * commits, and reviews with keyboard navigation.
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

    case "o":
      // Open PR in browser
      if (ctx.state.prInfo) {
        Bun.spawn(["open", ctx.state.prInfo.url])
      }
      return true

    case "y": {
      // y: Copy selected commit SHA, Y: Copy PR URL
      if (ctx.state.prInfo) {
        if (key.shift) {
          // Y = copy PR URL
          Bun.spawn(["sh", "-c", `echo -n "${ctx.state.prInfo.url}" | pbcopy`])
          ctx.setState((s) => showToast(s, "PR URL copied", "success"))
        } else {
          // y = copy selected commit SHA
          const commit = panel?.getSelectedCommit()
          if (commit) {
            Bun.spawn(["sh", "-c", `echo -n "${commit.sha}" | pbcopy`])
            ctx.setState((s) => showToast(s, `Copied ${commit.sha.slice(0, 8)}`, "success"))
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
      // Move cursor down in commit list (no re-render needed)
      if (panel) {
        panel.moveCursor(1)
      }
      return true

    case "k":
    case "up":
      // Move cursor up in commit list (no re-render needed)
      if (panel) {
        panel.moveCursor(-1)
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
