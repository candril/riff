import type { Action } from "../../actions/types"
import { keyedName, PER_KEY_COMMANDS, type UsageCounts } from "./counts"

export interface ActionUsage {
  id: string
  label: string
  /** The command, or command and key, its key count is read off; null when it has no key, or one no keymap command runs. */
  countedAs: string | null
  /** That key does more than this action, so byKey counts those uses too. */
  shared: boolean
  /** Null for a key riff cannot see; not zero, unknown. */
  byKey: number | null
  byPalette: number
}

export interface UsageReport {
  since: string | null
  actions: ActionUsage[]
  /** Commands run on a key that no palette action names, most used first. */
  otherCommands: { name: string; count: number }[]
}

/**
 * Actions the palette runs through a case of its own, whose key runs a
 * command the registry does not name: a catch-all, or one that does more.
 * `shared`: the key does other things too, so its count is an upper bound.
 */
export const KEY_ATTRIBUTION: Readonly<Record<string, { command: string; key?: string; shared?: boolean }>> = {
  yank: { command: "diff.key", key: "y" },
  "yank-raw": { command: "diff.key", key: "Y" },
  "toggle-split": { command: "diff.key", key: "\\" },
  "expand-context": { command: "diff.key", key: "Enter", shared: true },
  "show-all-files": { command: "diff.key", key: "Esc", shared: true },
  "toggle-view": { command: "global.surface", key: "i" },
  "filter-view": { command: "tree.key", key: "/" },
  "toggle-unviewed-files-only": { command: "tree.key", key: "H" },
  "open-in-browser": { command: "gchord.openLink", shared: true },
}

function countedAs(action: Pick<Action, "id" | "command" | "shortcut">): { name: string; shared: boolean } | null {
  const attributed = KEY_ATTRIBUTION[action.id]
  if (attributed) {
    return { name: attributed.key ? keyedName(attributed.command, attributed.key) : attributed.command, shared: attributed.shared ?? false }
  }
  if (!action.command) return null
  if (!PER_KEY_COMMANDS.has(action.command)) return { name: action.command, shared: false }
  return action.shortcut ? { name: keyedName(action.command, action.shortcut), shared: false } : null
}

/** Least used first, so what nobody touches tops the list. */
export function usageReport(counts: UsageCounts | null, actions: readonly Action[]): UsageReport {
  const keys = counts?.keys ?? {}
  const palette = counts?.palette ?? {}
  const rows = actions.map((action): ActionUsage => {
    const counted = countedAs(action)
    // With neither a command nor a shortcut the palette is its only way in.
    const paletteOnly = !action.command && !action.shortcut
    return {
      id: action.id,
      label: typeof action.label === "string" ? action.label : action.id,
      countedAs: counted?.name ?? null,
      shared: counted?.shared ?? false,
      byKey: counted ? (keys[counted.name] ?? 0) : paletteOnly ? 0 : null,
      byPalette: palette[action.id] ?? 0,
    }
  })
  rows.sort((a, b) => total(a) - total(b) || a.id.localeCompare(b.id))
  const named = new Set(rows.map((row) => row.countedAs).filter((name): name is string => name !== null))
  const otherCommands = Object.entries(keys)
    .filter(([name]) => !named.has(name))
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  return { since: counts?.since ?? null, actions: rows, otherCommands }
}

function total(row: ActionUsage): number {
  return (row.byKey ?? 0) + row.byPalette
}

export function formatUsageReport(report: UsageReport): string {
  if (!report.since) return "No usage recorded yet. riff counts commands and palette picks in ~/.riff/usage.json as you use it."
  const width = Math.max(...report.actions.map((row) => row.label.length))
  const lines = [`Since ${report.since}`, "", `${"Action".padEnd(width)}   key  palette  counted as`]
  for (const row of report.actions) {
    const byKey = row.byKey === null ? "?" : String(row.byKey)
    const via = row.countedAs
      ? `${row.countedAs}${row.shared ? " (shared: includes its key's other uses)" : ""}`
      : row.byKey === null ? "(key not seen)" : "(palette only)"
    lines.push(`${row.label.padEnd(width)}  ${byKey.padStart(4)}  ${String(row.byPalette).padStart(7)}  ${via}`)
  }
  const unused = report.actions.filter((row) => row.byKey === 0 && row.byPalette === 0).length
  const unseen = report.actions.filter((row) => row.byKey === null && row.byPalette === 0).length
  lines.push("", `${unused} of ${report.actions.length} actions never used; ${unseen} more never picked from the palette, their key not seen.`)
  if (report.otherCommands.length > 0) {
    lines.push("", "Keys with no palette action:")
    for (const { name, count } of report.otherCommands) lines.push(`  ${String(count).padStart(6)}  ${name}`)
  }
  return lines.join("\n")
}
