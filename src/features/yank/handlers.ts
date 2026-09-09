/**
 * Yank diff lines to the clipboard.
 *
 * `y` copies the visual-line selection, or the cursor's line when nothing is
 * selected. By default it copies the code as it reads on screen — no `+`/`-`
 * gutter — because the usual destination is an editor or a chat message.
 * `Y` keeps the markers for when the diff itself is the point.
 */

import type { AppState } from "../../state"
import type { VimCursorState } from "../../vim-diff/types"
import type { DiffLineMapping } from "../../vim-diff/line-mapping"
import { showToast, clearToast } from "../../state"
import { getSelectionRange, exitVisualMode } from "../../vim-diff/cursor-state"
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

  const [start, end] = getSelectionRange(vimState) ?? [vimState.line, vimState.line]

  const collected: string[] = []
  for (let i = start; i <= end; i++) {
    const line = lineMapping.getLine(i)
    if (!line || SKIPPED_TYPES.has(line.type)) continue
    // `content` may be a display transform (an aligned markdown table);
    // the clipboard should get what the file says.
    collected.push(options.raw ? line.rawLine : line.sourceContent ?? line.content)
  }

  if (collected.length === 0) {
    toast(ctx, "Nothing to yank here", "info")
    return
  }

  const copied = await copyToClipboard(collected.join("\n"))
  if (!copied.ok) {
    toast(ctx, `Copy failed: ${copied.error}`, "error", 3000)
    return
  }

  // Vim leaves visual mode after a yank; staying in it would make the next
  // motion extend a selection the user considers finished.
  if (vimState.mode === "visual-line") {
    ctx.setVimState(exitVisualMode(vimState))
  }

  const count = collected.length
  const what = count === 1 ? "1 line" : `${count} lines`
  toast(ctx, options.raw ? `Yanked ${what} with diff markers` : `Yanked ${what}`, "success")
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
