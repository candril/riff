/**
 * Follow the link under the cursor (spec 057).
 *
 * A review is full of pointers out of the diff — `[ADR-017](../decisions/…)`,
 * `see src/app.ts:42`, a URL. `gf` goes where they point: to the file's own
 * rows when the diff has it, to $EDITOR when it doesn't, to the browser when
 * it is a URL.
 */

import type { AppState } from "../../state"
import type { VimCursorState } from "../../vim-diff/types"
import type { DiffLineMapping } from "../../vim-diff/line-mapping"
import { showToast, clearToast } from "../../state"
import { linkAt, resolveCandidates } from "../../utils/links"

export interface FollowLinkContext {
  setState: (updater: (s: AppState) => AppState) => void
  getVimState: () => VimCursorState
  getLineMapping: () => DiffLineMapping
  render: () => void
  /** Jump to the first candidate the diff is showing. False when it shows
   *  none of them. */
  jumpToFile: (candidates: string[], line?: number) => boolean
  /** Open a path the diff doesn't cover, in $EDITOR or a tmux window. */
  openPath: (candidates: string[], line: number | undefined, tmux: boolean) => void
  openUrl: (url: string) => void
}

export function handleFollowLink(
  ctx: FollowLinkContext,
  options: { tmux?: boolean; urlsOnly?: boolean } = {},
): void {
  const vimState = ctx.getVimState()
  const row = ctx.getLineMapping().getLine(vimState.line)
  if (!row) return

  const link = linkAt(row.content, vimState.col)
  if (!link) {
    toast(ctx, options.urlsOnly ? "No URL under the cursor" : "No link under the cursor")
    return
  }

  if (link.kind === "url") {
    ctx.openUrl(link.target)
    return
  }

  if (options.urlsOnly) {
    toast(ctx, "That's a file — gf follows it")
    return
  }

  // A link is read relative to the file it sits in, a bare path from the
  // repo root; both readings are passed on, and whichever exists answers.
  const candidates = resolveCandidates(link.target, row.filename ?? "")
  if (candidates.length === 0) {
    toast(ctx, "Nothing to follow there")
    return
  }

  // Staying inside riff beats opening an editor for a file that is part of
  // the review anyway — the diff is what the reader came for.
  if (!options.tmux && ctx.jumpToFile(candidates, link.line)) return

  ctx.openPath(candidates, link.line, options.tmux === true)
}

function toast(ctx: FollowLinkContext, message: string): void {
  ctx.setState((s) => showToast(s, message, "info"))
  ctx.render()
  setTimeout(() => {
    ctx.setState(clearToast)
    ctx.render()
  }, 2000)
}
