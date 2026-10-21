import type { ConversationRow, ConversationRows } from "../components/pr-info-conversation-rows"
import { theme } from "../theme"

/** Conversation rows as panelSections would build them, for the views' and the panel island's tests. */

export const BODY = "Rename `greet` to **welcome**.\n\n- one\n- two"

export const dana = (over: Partial<Extract<ConversationRow, { kind: "item" }>> = {}): ConversationRow => ({
  kind: "item",
  key: "501",
  selected: false,
  indent: 0,
  header: [
    { text: "▶ ", fg: theme.subtext0, flex: "fixed" },
    { text: "@dana", fg: theme.sapphire, flex: "fixed" },
    { text: "  a preview far too long for the row it sits on", fg: theme.subtext1, flex: "grow" },
    { text: "    6h", fg: theme.overlay0, flex: "fixed" },
  ],
  body: [],
  ...over,
})

export const opened = (selected: boolean): ConversationRows => ({
  rows: [
    dana({
      selected,
      header: [
        { text: "▼ ", fg: theme.subtext0, flex: "fixed" },
        { text: "@dana", fg: selected ? theme.blue : theme.sapphire, flex: "fixed" },
        { text: "", fg: theme.subtext1, flex: "grow" },
        { text: "    6h", fg: theme.overlay0, flex: "fixed" },
      ],
      body: [
        { kind: "markdown", key: "pr-comment-501", id: "pr-comment-501", text: BODY, images: ["screenshot"], indent: 4 },
        { kind: "reactions", key: "501:reactions", indent: 4, pills: [{ text: "👍 2", fg: theme.subtext1 }] },
      ],
    }),
    dana({ key: "502", selected: !selected }),
  ],
  note: null,
})

export const reviewers = (selected: boolean, label?: string): ConversationRow => ({
  kind: "reviewers",
  key: "pending-frank,grace",
  selected,
  ...(label ? { label } : {}),
  header: [
    { text: "○ ", fg: theme.yellow, flex: "fixed" },
    { text: "awaiting review (2)", fg: theme.yellow, flex: "fixed" },
  ],
  names: [
    { text: "@frank", fg: theme.sapphire },
    { text: "@grace", fg: theme.sapphire },
  ],
  namesIndent: 4,
})
