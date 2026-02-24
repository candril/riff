import { Box, Text, ScrollBox, h, DiffRenderable, type ScrollBoxRenderable, type DiffRenderable as DiffRenderableType } from "@opentui/core"
import { colors, theme } from "../theme"

export interface DiffViewProps {
  diff: string
  filetype?: string
  view?: "unified" | "split"
  showLineNumbers?: boolean
}

export function DiffView({
  diff,
  filetype,
  view = "unified",
  showLineNumbers = true,
}: DiffViewProps) {
  if (!diff.trim()) {
    return Box(
      {
        width: "100%",
        height: "100%",
        justifyContent: "center",
        alignItems: "center",
      },
      Text({ content: "No changes to display", fg: colors.textDim })
    )
  }

  return ScrollBox(
    {
      id: "diff-scroll",
      width: "100%",
      height: "100%",
      scrollY: true,
      scrollX: false, // Disable horizontal scroll - content wraps or clips
      verticalScrollbarOptions: {
        showArrows: false,
        trackOptions: {
          backgroundColor: theme.surface0,
          foregroundColor: theme.surface2,
        },
      },
    },
    h(DiffRenderable, {
      id: "diff-content",
      diff,
      view,
      filetype,
      showLineNumbers,
      // Catppuccin Mocha colors
      addedBg: colors.addedBg,
      removedBg: colors.removedBg,
      contextBg: colors.contextBg,
      addedSignColor: colors.addedFg,
      removedSignColor: colors.removedFg,
      lineNumberFg: theme.overlay0,
    })
  )
}

/**
 * Get a reference to the scroll box for programmatic scrolling
 */
export function getScrollBox(renderer: { root: { findDescendantById: (id: string) => unknown } }): ScrollBoxRenderable | null {
  return renderer.root.findDescendantById("diff-scroll") as ScrollBoxRenderable | null
}

/**
 * Get a reference to the diff renderable
 */
export function getDiffRenderable(renderer: { root: { findDescendantById: (id: string) => unknown } }): DiffRenderableType | null {
  return renderer.root.findDescendantById("diff-content") as DiffRenderableType | null
}
