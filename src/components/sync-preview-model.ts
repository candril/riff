import type { SyncItem } from "./sync-items"

export type SyncLineTone = "added" | "removed" | "plain"

export interface SyncLine {
  sign?: "+" | "-"
  text: string
  tone: SyncLineTone
}

export interface SyncCard {
  location: string
  /** The author a reply answers; only replies carry it. */
  replyTo?: string
  lines: SyncLine[]
}

export interface SyncSection {
  title: string
  cards: SyncCard[]
}

export type SyncStatus = { kind: "none" } | { kind: "loading" } | { kind: "error"; message: string }

export interface SyncPreviewModel {
  /** New comments, edits and replies, each left out when it has nothing in it. */
  sections: SyncSection[]
  footer: {
    status: SyncStatus
    /** Null when there is nothing to sync, so there is nothing to press. */
    button: string | null
  }
}

function truncate(text: string, maxLen: number): string {
  const singleLine = text.replace(/\n/g, " ").trim()
  if (singleLine.length <= maxLen) return singleLine
  return singleLine.slice(0, maxLen - 1) + "…"
}

function firstLine(text: string, maxLen: number = 60): string {
  const line = text.split("\n")[0] || ""
  return truncate(line, maxLen)
}

const location = (item: SyncItem) => `${item.comment.filename}:${item.comment.line}`

function newCard(item: SyncItem): SyncCard {
  return { location: location(item), lines: [{ sign: "+", text: firstLine(item.comment.body), tone: "added" }] }
}

function editCard(item: SyncItem): SyncCard {
  return {
    location: location(item),
    lines: [
      { sign: "-", text: firstLine(item.comment.body), tone: "removed" },
      { sign: "+", text: firstLine(item.newBody || ""), tone: "added" },
    ],
  }
}

function replyCard(item: SyncItem): SyncCard {
  return {
    location: location(item),
    replyTo: item.parent?.author || "unknown",
    lines: [{ text: firstLine(item.comment.body), tone: "plain" }],
  }
}

function section(title: string, items: SyncItem[], card: (item: SyncItem) => SyncCard): SyncSection[] {
  return items.length > 0 ? [{ title: `${title} (${items.length})`, cards: items.map(card) }] : []
}

function status(loading: boolean, error: string | null): SyncStatus {
  if (loading) return { kind: "loading" }
  if (error) return { kind: "error", message: error }
  return { kind: "none" }
}

export function syncPreviewModel(
  items: SyncItem[],
  { loading, error }: { loading: boolean; error: string | null }
): SyncPreviewModel {
  const total = items.length
  return {
    sections: [
      ...section("New Comments", items.filter((i) => i.type === "new"), newCard),
      ...section("Edits", items.filter((i) => i.type === "edit"), editCard),
      ...section("Replies", items.filter((i) => i.type === "reply"), replyCard),
    ],
    footer: {
      status: status(loading, error),
      button: total > 0 ? `Sync ${total} change${total !== 1 ? "s" : ""}` : null,
    },
  }
}
