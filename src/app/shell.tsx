/**
 * riff's layout, mounted once at startup (spec 100, M3). Each render pass
 * feeds the islands, swaps what sits in the view slot, and flips which
 * hosts are visible; the layout itself stays mounted.
 */

import type { BoxRenderable, CliRenderer, Renderable } from "@opentui/core"
import { discard } from "../utils/renderables"
import { mountSolid } from "./solid-island"

/** Bottom to top: a later host is drawn over an earlier one where they overlap. */
export const OVERLAYS = [
  "actionMenu",
  "toast",
  "reviewPreview",
  "syncPreview",
  "filePicker",
  "commentsPicker",
  "marksPicker",
  "occurrencePicker",
  "commitPicker",
  "helpOverlay",
  "diffPeek",
  "hunkPeek",
  "confirmDialog",
] as const

export type OverlayId = (typeof OVERLAYS)[number]

export interface ShellParts {
  header: Renderable
  /** The file tree's own container, which keeps its `visible` for the tree's toggle. */
  tree: Renderable
  /** The thread panel's host, which shows and hides itself as the panel opens and closes. */
  threadPanel: Renderable
  /** The chat column's host, shown and hidden the same way, right of the thread panel. */
  chat: Renderable
  searchPrompt: Renderable
  statusBar: Renderable
  flashPrompt: Renderable
  overlays: Record<OverlayId, Renderable>
}

export interface AppShell {
  /** The column at the renderer's root that everything else is mounted in. */
  root: BoxRenderable
  setView(node: Renderable, options: { withTree: boolean }): void
  show(id: OverlayId | "searchPrompt", shown: boolean): void
  showFlash(shown: boolean): void
}

export function createAppShell(renderer: CliRenderer, parts: ShellParts): AppShell {
  let treeSlot!: BoxRenderable
  let viewSlot!: BoxRenderable
  let view: Renderable | null = null

  // Hidden hosts stay mounted with `visible` off rather than empty: several
  // are absolute and full-size, and an empty one would still take the
  // clicks and the wheel meant for the diff under it.
  for (const host of [parts.searchPrompt, parts.flashPrompt, ...OVERLAYS.map((id) => parts.overlays[id])]) {
    host.visible = false
  }

  const island = mountSolid(
    renderer,
    () => (
      <>
        {parts.header}
        <box flexGrow={1} width="100%">
          <box width="100%" height="100%" flexDirection="row">
            {/*
             * A box of its own: the tree's toggle sets the container's
             * `visible` and the view sets the slot's, so neither undoes the other.
             * It must not shrink: the tree draws its full width regardless, so a
             * narrower slot would let the thread panel slide over it.
             */}
            <box ref={(node: BoxRenderable) => (treeSlot = node)} height="100%" flexShrink={0}>
              {parts.tree}
            </box>
            {/*
             * The view grows from no width at all: from its own full width it
             * would take the thread panel's shrink in proportion, and the panel
             * gives up columns only when it and the tree cannot both fit.
             */}
            <box ref={(node: BoxRenderable) => (viewSlot = node)} flexGrow={1} flexBasis={0} minWidth={0} height="100%" />
            {/*
             * A child of the row itself, not of a slot box: the panel sizes and
             * shrinks against the tree and the view directly. Hidden, it takes
             * no columns, since OpenTUI lays out a hidden box as display none.
             */}
            {parts.threadPanel}
            {/* After the thread panel, so the threads sit between the diff and the chat (spec 102). */}
            {parts.chat}
          </box>
        </box>
        {parts.searchPrompt}
        {/*
         * Flash takes the status bar's row rather than a row of its own:
         * growing the footer would shrink every panel by a line, and the
         * labels would land on rows that had just moved.
         */}
        {parts.statusBar}
        {parts.flashPrompt}
        {OVERLAYS.map((id) => parts.overlays[id])}
      </>
    ),
    { width: "100%", height: "100%", flexDirection: "column" }
  )
  renderer.root.add(island.host)

  return {
    root: island.host,
    setView(node, { withTree }) {
      treeSlot.visible = withTree
      if (node === view) return
      if (view) discard(view)
      viewSlot.add(node)
      view = node
    },
    show(id, shown) {
      ;(id === "searchPrompt" ? parts.searchPrompt : parts.overlays[id]).visible = shown
    },
    showFlash(shown) {
      parts.flashPrompt.visible = shown
      parts.statusBar.visible = !shown
    },
  }
}
