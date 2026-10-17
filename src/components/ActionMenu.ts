import { Box, Text } from "@opentui/core"
import type { CliRenderer } from "@opentui/core"
import { PromptInput } from "./PromptInput"
import { theme } from "../theme"
import { actionMenuModel, type ActionMenuMode, type ActionMenuRow } from "./action-menu-model"

export type { ActionMenuMode, SubmenuRow } from "./action-menu-model"

export interface ActionMenuProps {
  renderer: CliRenderer
  selectedIndex: number
  mode: ActionMenuMode
}

/**
 * Action menu overlay (command palette)
 * Styled similar to OpenCode's command menu. Supports a "submenu" mode
 * (spec 042) that replaces the action list with a flat, titled row set
 * while the palette stays open.
 */
export function ActionMenu({ renderer, selectedIndex, mode }: ActionMenuProps) {
  const model = actionMenuModel(mode, selectedIndex)
  return Box(
    {
      id: "action-menu-overlay",
      width: "100%",
      height: "100%",
      position: "absolute",
      top: 0,
      left: 0,
      // Sits above other modal overlays (the InlineCommentOverlay uses
      // 50) so the palette is reachable while a thread is visible
      // (spec 042).
      zIndex: 100,
    },
    // Dim background overlay
    Box({
      width: "100%",
      height: "100%",
      position: "absolute",
      top: 0,
      left: 0,
      backgroundColor: "#00000080",
    }),
    // Command palette centered
    Box(
      {
        position: "absolute",
        top: 2,
        left: "25%",
        width: "50%",
        flexDirection: "column",
        backgroundColor: theme.mantle,
      },
      // Header row: title + esc hint
      Box(
        {
          flexDirection: "row",
          justifyContent: "space-between",
          paddingX: 2,
          paddingY: 1,
        },
        Text({ content: model.title, fg: theme.subtext0 }),
        Text({ content: model.hint, fg: theme.overlay0 })
      ),
      Box(
        {
          id: "action-menu-search",
          flexDirection: "row",
          paddingX: 2,
          paddingBottom: 1,
          // One row, always: the shared input has no height of its own, and
          // a box that has to measure it can come out wrong when the field
          // has just moved here from another prompt.
          height: 1,
        },
        PromptInput(renderer, "action-menu")
      ),
      Box(
        {
          flexDirection: "column",
          paddingBottom: 1,
        },
        ...model.rows.map(Row)
      )
    )
  )
}

function Row(row: ActionMenuRow) {
  switch (row.kind) {
    case "category":
      return Box({ paddingX: 2, paddingTop: 1 }, Text({ content: row.label, fg: theme.lavender }))
    case "action":
      return Box(
        {
          flexDirection: "row",
          justifyContent: "space-between",
          backgroundColor: row.selected ? "#585b70" : undefined,
          paddingX: 2,
          width: "100%",
        },
        Text({ content: row.label, fg: row.labelFg }),
        row.shortcut ? Text({ content: row.shortcut, fg: theme.overlay0 }) : null
      )
    case "submenu":
      // One line per row: the label is what the reader is choosing between, so
      // it stays whole and a long trailing note is clipped instead of wrapping
      // the row into two.
      return Box(
        {
          flexDirection: "row",
          justifyContent: "space-between",
          backgroundColor: row.selected ? "#585b70" : undefined,
          paddingX: 2,
          width: "100%",
          height: 1,
          overflow: "hidden",
        },
        Box({ flexShrink: 0 }, Text({ content: row.label, fg: row.labelFg })),
        row.trailing
          ? Box({ flexShrink: 1, overflow: "hidden", paddingLeft: 2 }, Text({ content: row.trailing, fg: row.trailingFg }))
          : null
      )
  }
}
