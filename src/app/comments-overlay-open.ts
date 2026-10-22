import { expandThreadFor, openInlineCommentOverlay } from "../state"
import { exitVisualMode, isVisualMode } from "../vim-diff/cursor-state"
import { blockAnchor } from "../features/comments/block-anchor"
import type { GlobalKeyContext } from "./global-keys"

export interface CommentsOverlayOpen {
  openCommentsOverlay(mode: "view" | "compose" | "edit"): boolean
  openCommentsPanelForCursor(): void
}

export function createCommentsOverlayOpen(
  ctx: Pick<
    GlobalKeyContext,
    "getState" | "setState" | "getVimState" | "setVimState" | "getLineMapping" | "getCommentScope" | "render"
  >,
): CommentsOverlayOpen {
  /**
   * The comments panel, opened on whatever the diff cursor is pointing at.
   * Both live here rather than in the diff's own key handling because
   * `Ctrl-t` reaches them from every view (spec 064).
   */
  function openCommentsOverlay(mode: "view" | "compose" | "edit"): boolean {
    // spec 039: Enter opens the overlay in view mode if there's an
    // existing thread on this anchor; `c` opens it in compose mode
    // on any commentable line. Returns true when the overlay was
    // opened so the caller can fall back (e.g. Enter → expand
    // divider) when this is a no-op.
    const s = ctx.getState()
    const lineMapping = ctx.getLineMapping()
    const vimState = ctx.getVimState()
    // A visual-line selection anchors on the first commentable line
    // it covers — the same rule `handleAddComment` uses for `C`, so
    // both routes land the comment in the same place.
    const block = blockAnchor(lineMapping, ctx.getCommentScope())
    // A line GitHub cannot take is still a line, and what gets written on it
    // is a note (spec 085).
    if (!block) return false
    const { anchor, blockStart, anchorHash } = block

    const root = s.comments.find(
      (c) =>
        c.filename === anchor.filename &&
        c.line === anchor.line &&
        c.side === anchor.side &&
        !c.inReplyTo
    )
    if (mode === "view" && !root) return false

    // The selection has served its purpose; leave visual mode so the
    // highlight doesn't linger behind the composer.
    if (isVisualMode(vimState)) {
      ctx.setVimState(exitVisualMode(vimState))
    }

    ctx.setState((st) => {
      const opened = openInlineCommentOverlay(
        st, anchor.filename, anchor.line, anchor.side, mode, blockStart, undefined,
        { note: anchor.note, anchorHash }
      )
      // Asked for this thread by name: a resolved one opens rather than
      // showing its root and hiding the rest.
      return mode === "view" && root ? expandThreadFor(opened, root.id) : opened
    })
    ctx.render()
    return true
  }

  function openCommentsPanelForCursor(): void {
    // Open in view mode without an anchor — use the cursor's file
    // (or the currently selected file) so the panel scopes
    // correctly. Anchor line is 0; compose actions inside the
    // panel will re-anchor to the highlighted thread.
    const s = ctx.getState()
    const lineMapping = ctx.getLineMapping()
    const vimState = ctx.getVimState()
    const cursorLine = lineMapping.getLine(vimState.line)
    const filename =
      cursorLine?.filename ??
      (s.selectedFileIndex !== null
        ? s.files[s.selectedFileIndex]?.filename ?? ""
        : "")
    ctx.setState((st) =>
      openInlineCommentOverlay(st, filename, 0, "RIGHT", "view")
    )
    ctx.render()
  }

  return { openCommentsOverlay, openCommentsPanelForCursor }
}
