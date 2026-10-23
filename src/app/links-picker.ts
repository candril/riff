import type { AppState } from "../state"
import { createOpenLink } from "./open-link"
import { collectFromSources, type LinkSource } from "../utils/link-targets"
import { referenceRepo, resolvedReferences } from "../features/references"
import { reactSubmenu, type ActionMenuState } from "../features/action-menu"
import type { ToastState } from "../features/toast/state"
import type { ReactionTarget } from "../types"

export interface LinksPicker {
  /** What the picker is called, which is the difference `gx` and `gX` make. */
  linksTitle(action: "open" | "copy"): string
  openLinksPicker(sources: readonly LinkSource[], title: string, action?: "open" | "copy"): void
  openReactPicker(): void
}

/** The pickers the panels open over themselves: the links in what they show, and the reactions. */
export function createLinksPicker(ctx: {
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
  toast: Pick<ToastState, "show" | "clear">
  actionMenu: Pick<ActionMenuState, "showSubmenu">
  /** What React… acts on: whatever has focus now (reactionTargetOf). */
  reactionTarget: () => ReactionTarget | null
}): LinksPicker {
  const openLink = createOpenLink(ctx)

  function linksTitle(action: "open" | "copy"): string {
    return action === "copy" ? "Copy a link" : "Links"
  }

  /**
   * The links in a piece of text, to pick one from (spec 077).
   *
   * A rendered comment has no cursor to put on a link the way the diff
   * does, so riff lists what it found. One link is not a question worth
   * asking, and none is worth saying out loud rather than opening an empty
   * picker.
   */
  function openLinksPicker(
    sources: readonly LinkSource[],
    title: string,
    action: "open" | "copy" = "open",
  ): void {
    const links = collectFromSources(sources, {
      repo: referenceRepo(),
      resolved: resolvedReferences(),
    })

    if (links.length === 0) {
      ctx.toast.show("No links here", "info")
      ctx.render()
      setTimeout(() => {
        ctx.toast.clear()
        ctx.render()
      }, 2000)
      return
    }
    if (links.length === 1) {
      openLink(action, links[0]!)
      return
    }
    ctx.actionMenu.showSubmenu({ kind: "links", links, action, title })
    ctx.render()
  }

  function openReactPicker(): void {
    const submenu = reactSubmenu(ctx.getState(), ctx.reactionTarget(), false)
    if (submenu) ctx.actionMenu.showSubmenu(submenu)
    ctx.render()
  }

  return { linksTitle, openLinksPicker, openReactPicker }
}
