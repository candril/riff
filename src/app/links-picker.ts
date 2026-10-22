import type { AppState } from "../state"
import { clearToast, openActionMenu, openActionSubmenu, showToast } from "../state"
import { createOpenLink } from "./open-link"
import { collectFromSources, type LinkSource } from "../utils/link-targets"
import { referenceRepo, resolvedReferences } from "../features/references"
import * as actionMenu from "../features/action-menu"

export interface LinksPicker {
  /** What the picker is called, which is the difference `gx` and `gX` make. */
  linksTitle(action: "open" | "copy"): string
  openLinksPicker(sources: readonly LinkSource[], title: string, action?: "open" | "copy"): void
  openReactPicker(): void
}

/** The pickers the panels open over themselves: the links in what they show, and the reactions. */
export function createLinksPicker(ctx: {
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
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
      ctx.setState((s) => showToast(s, "No links here", "info"))
      ctx.render()
      setTimeout(() => {
        ctx.setState(clearToast)
        ctx.render()
      }, 2000)
      return
    }
    if (links.length === 1) {
      openLink(action, links[0]!)
      return
    }
    ctx.setState((s) =>
      openActionSubmenu(openActionMenu(s), { kind: "links", links, action, title })
    )
    ctx.render()
  }

  function openReactPicker(): void {
    ctx.setState((s) => actionMenu.openReactSubmenu(s, false))
    ctx.render()
  }

  return { linksTitle, openLinksPicker, openReactPicker }
}
