/**
 * Confirm dialog - modal overlay for dangerous actions.
 *
 * Shows a confirmation prompt before executing destructive operations.
 * Styled similar to presto's confirmation dialog.
 */

import { Box, Text } from "@opentui/core"
import { theme, colors } from "../theme"

export interface ConfirmDialogProps {
  /** Title/header for the dialog */
  title: string
  /** Main message describing the action */
  message: string
  /** Optional secondary details */
  details?: string
}

export function ConfirmDialog({ title, message, details }: ConfirmDialogProps) {
  return Box(
    {
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      zIndex: 100,
      justifyContent: "center",
      alignItems: "center",
    },
    // Dim background
    Box({
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      backgroundColor: "#00000080",
    }),
    // Dialog box
    Box(
      {
        width: 50,
        flexDirection: "column",
        backgroundColor: theme.base,
      },
      // Header
      Box(
        {
          paddingX: 2,
          paddingY: 1,
          backgroundColor: theme.mantle,
        },
        Text({ content: title, fg: theme.yellow })
      ),
      // Body
      Box(
        {
          flexDirection: "column",
          paddingX: 2,
          paddingY: 1,
          gap: 1,
        },
        Text({ content: message, fg: theme.text }),
        details ? Text({ content: details, fg: colors.textDim }) : null
      ),
      // Footer with Y/n hint
      Box(
        {
          flexDirection: "row",
          paddingX: 2,
          paddingY: 1,
          backgroundColor: theme.mantle,
        },
        Text({ content: "Y", fg: theme.green }),
        Text({ content: "es / ", fg: colors.textMuted }),
        Text({ content: "n", fg: theme.red }),
        Text({ content: "o", fg: colors.textMuted })
      )
    )
  )
}
