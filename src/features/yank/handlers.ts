/**
 * Yank diff lines to the clipboard.
 *
 * `y` copies the selection — the exact characters of a charwise one, whole
 * rows of a linewise one — or the cursor's line when nothing is selected. By
 * default it copies the code as it reads on screen — no `+`/`-` gutter —
 * because the usual destination is an editor or a chat message. `Y` keeps the
 * markers for when the diff itself is the point, and has no charwise reading:
 * a gutter belongs to a whole row.
 */

import type { AppState } from "../../state"
import type { VimCursorState } from "../../vim-diff/types"
import type { DiffLineMapping } from "../../vim-diff/line-mapping"
import { showToast, clearToast } from "../../state"
import {
  getSelectionRange,
  getCharSelection,
  exitVisualMode,
  isVisualMode,
  type CharSelection,
} from "../../vim-diff/cursor-state"
import { copyToClipboard } from "../../utils/clipboard"

export interface YankContext {
  setState: (updater: (s: AppState) => AppState) => void
  getVimState: () => VimCursorState
  setVimState: (state: VimCursorState) => void
  getLineMapping: () => DiffLineMapping
  render: () => void
}

/** Rows that carry no code — copying them would paste UI furniture. */
const SKIPPED_TYPES = new Set(["file-header", "hunk-header", "divider", "spacing", "no-newline"])

export async function handleYank(ctx: YankContext, options: { raw: boolean }): Promise<void> {
  const vimState = ctx.getVimState()
  const lineMapping = ctx.getLineMapping()

  const charSelection = options.raw ? null : getCharSelection(vimState)
  const collected = charSelection
    ? collectChars(lineMapping, charSelection)
    : collectLines(lineMapping, getSelectionRange(vimState) ?? [vimState.line, vimState.line], options.raw)

  if (collected.length === 0) {
    toast(ctx, "Nothing to yank here", "info")
    return
  }

  const text = collected.join("\n")
  const copied = await copyToClipboard(text)
  if (!copied.ok) {
    toast(ctx, `Copy failed: ${copied.error}`, "error", 3000)
    return
  }

  // Vim leaves visual mode after a yank; staying in it would make the next
  // motion extend a selection the user considers finished.
  if (isVisualMode(vimState)) {
    ctx.setVimState(exitVisualMode(vimState))
  }

  if (charSelection) {
    const count = text.length
    toast(ctx, `Yanked ${count} ${count === 1 ? "character" : "characters"}`, "success")
    return
  }

  const count = collected.length
  const what = count === 1 ? "1 line" : `${count} lines`
  toast(ctx, options.raw ? `Yanked ${what} with diff markers` : `Yanked ${what}`, "success")
}

function collectLines(
  lineMapping: DiffLineMapping,
  [start, end]: [number, number],
  raw: boolean,
): string[] {
  const collected: string[] = []
  for (let i = start; i <= end; i++) {
    const line = lineMapping.getLine(i)
    if (!line || SKIPPED_TYPES.has(line.type)) continue
    // `content` may be a display transform (an aligned markdown table);
    // the clipboard should get what the file says.
    collected.push(raw ? line.rawLine : line.sourceContent ?? line.content)
  }
  return collected
}

/**
 * The characters between the two ends of a charwise selection.
 *
 * Sliced from `content` — what is on screen — because that is what the
 * columns were measured against. Where a markdown table was padded onto a
 * grid (spec 053) the padding comes along; an offset into a padded row has
 * no counterpart in `sourceContent`.
 */
function collectChars(lineMapping: DiffLineMapping, selection: CharSelection): string[] {
  const { startLine, startCol, endLine, endCol } = selection
  const collected: string[] = []

  for (let i = startLine; i <= endLine; i++) {
    const line = lineMapping.getLine(i)
    if (!line || SKIPPED_TYPES.has(line.type)) continue
    const from = i === startLine ? startCol : 0
    const to = i === endLine ? endCol + 1 : line.content.length
    collected.push(line.content.slice(from, to))
  }

  return collected
}

function toast(
  ctx: YankContext,
  message: string,
  kind: "info" | "error" | "success",
  ms = 1500,
): void {
  ctx.setState((s) => showToast(s, message, kind))
  ctx.render()
  setTimeout(() => {
    ctx.setState(clearToast)
    ctx.render()
  }, ms)
}
