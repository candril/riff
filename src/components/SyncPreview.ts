/**
 * SyncPreview - Modal for previewing and confirming sync operations
 */

import { Box, Text } from "@opentui/core"
import { theme } from "../theme"
import { syncPreviewModel, type SyncCard, type SyncLineTone } from "./sync-preview-model"
import type { SyncItem } from "./sync-items"
import type { SyncPreviewState } from "../state"

export type { SyncItem }

const TONE: Record<SyncLineTone, string> = {
  added: theme.green,
  removed: theme.red,
  plain: theme.text,
}

function card(item: SyncCard) {
  return Box(
    {
      flexDirection: "column",
      backgroundColor: theme.surface0,
      paddingX: 1,
      paddingY: 1,
    },
    item.replyTo !== undefined
      ? Box(
          { flexDirection: "row", gap: 1 },
          Text({ content: item.location, fg: theme.blue }),
          Text({ content: "→", fg: theme.overlay0 }),
          Text({ content: `@${item.replyTo}`, fg: theme.lavender })
        )
      : Text({ content: item.location, fg: theme.blue }),
    ...item.lines.map((line) =>
      line.sign !== undefined
        ? Box(
            { flexDirection: "row", gap: 1 },
            Text({ content: line.sign, fg: TONE[line.tone] }),
            Text({ content: line.text, fg: TONE[line.tone] })
          )
        : Text({ content: line.text, fg: TONE[line.tone] })
    )
  )
}

export interface SyncPreviewProps {
  items: SyncItem[]
  state: Omit<SyncPreviewState, "open">
}

export function SyncPreview({ items, state }: SyncPreviewProps) {
  const model = syncPreviewModel(items, state)
  const { status, button } = model.footer
  const loading = status.kind === "loading"

  return Box(
    {
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      zIndex: 50,
      justifyContent: "center",
      alignItems: "center",
    },
    Box({
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      backgroundColor: "#00000080",
    }),
    Box(
      {
        width: 80,
        maxHeight: "80%",
        flexDirection: "column",
        backgroundColor: theme.mantle,
        overflow: "hidden",
      },
      Box(
        {
          flexDirection: "row",
          justifyContent: "space-between",
          paddingX: 2,
          paddingY: 1,
        },
        Text({ content: "Sync Changes", fg: theme.text }),
        Text({ content: "esc", fg: theme.overlay0 })
      ),

      // Content. The two-box split is the same viewport trick
      // `InlineCommentOverlay` uses: the outer box clips, the inner one
      // keeps every row at its natural height. Without `flexShrink: 0`
      // the modal's `maxHeight` makes the flex column compress each item
      // below its content height, and its location/body Texts land on the
      // same row — legible as interleaved characters, not as a scroll.
      Box(
        {
          flexDirection: "column",
          overflow: "hidden",
          flexShrink: 1,
          paddingX: 2,
          paddingY: 1,
        },
        Box(
          {
            flexDirection: "column",
            flexShrink: 0,
            gap: 1,
          },
          model.sections.length === 0
            ? Box({ paddingY: 2 }, Text({ content: "No changes to sync", fg: theme.overlay0 }))
            : null,
          ...model.sections.map((section) =>
            Box(
              { flexDirection: "column", gap: 1 },
              Text({ content: section.title, fg: theme.subtext0 }),
              ...section.cards.map(card)
            )
          )
        )
      ),

      Box(
        {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingX: 2,
          paddingY: 1,
        },
        status.kind === "loading"
          ? Text({ content: "Syncing...", fg: theme.yellow })
          : status.kind === "error"
            ? Text({ content: status.message, fg: theme.red })
            : Text({ content: "", fg: theme.overlay0 }),
        button !== null
          ? Box(
              {
                paddingX: 2,
                backgroundColor: loading ? theme.overlay0 : theme.blue,
              },
              Text({ content: button, fg: loading ? theme.surface0 : theme.base })
            )
          : null
      )
    )
  )
}
