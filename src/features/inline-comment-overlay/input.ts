/**
 * InlineCommentOverlay input handling (spec 039).
 *
 * Single capture point for every comment action while the overlay is
 * open. Two distinct modes:
 *
 *  - **view**: `j/k` highlight, `r/R` reply, `e/E` edit, `d` delete,
 *    `x` resolve, `S` submit, `Ctrl-n`/`Ctrl-p` adjacent thread,
 *    `Ctrl-p` falls through (palette). `Esc` closes.
 *  - **compose / edit**: char input flows into `state.inlineCommentOverlay.input`.
 *    `Enter` / `Ctrl-s` flush the draft (delegating to handlers);
 *    `Ctrl-p` (and `Ctrl-Enter`) flush it and push it to GitHub;
 *    `Ctrl-j` inserts a newline; `Esc` cancels back to view mode.
 *
 * Heavy lifting (delete / submit / resolve / adjacent jump / `$EDITOR`
 * reply / `$EDITOR` edit) is delegated through the context so this
 * stays a pure dispatcher.
 */

import type { KeyEvent } from "@opentui/core"
import type { AppState } from "../../state"
import type { Comment } from "../../types"
import type { Thread } from "../../utils/threads"
import {
  clearViewFilter,
  commitViewFilter,
  startViewFilter,
  closeInlineCommentOverlay,
  moveInlineCommentOverlayHighlight,
  getInlineCommentOverlayComments,
  getInlineCommentOverlayDisplayOrder,
  startInlineCompose,
  startInlineEdit,
  cancelInlineComposer,
  setInlineCommentInput,
  setMentionPicker,
  moveMentionPickerSelection,
  toggleInlineCommentOverlayExpand,
  setCommentCodePeek,
  rememberCommentDraft,
  showToast,
  clearToast,
} from "../../state"
import { commentHunk } from "./hunk"
import { groupIntoThreads } from "../../utils/threads"
import {
  readComposerValue,
  readComposerCursorOffset,
  replaceComposerRange,
  setComposerValue,
} from "../../components/CommentComposer"
import { collectMentionCandidates } from "../../utils/mentions"
import { getFilteredMentionCandidates } from "../../components/InlineCommentOverlay"
import {
  submitInlineDraft,
  submitInlineEditDraft,
  type InlineComposerHandlersContext,
} from "./handlers"

export interface InlineCommentOverlayInputContext extends InlineComposerHandlersContext {
  /** $EDITOR reply (Shift-r). Reuses the existing add-comment flow. */
  handleReplyExternal: () => void
  /** $EDITOR edit (Shift-e). Reuses the existing add-comment flow,
   *  which detects edits via the comment id passed back from the
   *  editor output. */
  handleEditExternal: () => void
  /** Delete highlighted comment. */
  handleDelete: (comment: Comment) => void
  /** Submit highlighted (local or edited synced) comment to GitHub. */
  handleSubmit: (comment: Comment) => void
  /** Toggle the thread's resolved state. */
  handleToggleResolved: (thread: Thread) => void
  /** Ctrl-n / Ctrl-p — jump to next/previous thread, repositioning the
   *  overlay. */
  handleJumpAdjacent: (direction: 1 | -1) => void
  /** The lines the comment being written replaces, as they read now, or
   *  null when riff cannot find them (spec 076). */
  getCommentedLines: () => string[] | null
  /** `n` from the panel — start a new comment anchored at the diff
   *  cursor's current line. The overlay layer doesn't know about line
   *  mapping or vim state, so this is wired up at the app level. */
  handleStartNewComment: () => void
  /** Move the diff cursor to the highlighted comment's source line so
   *  the diff stays in sync as the user navigates threads with j/k.
   *  Wired at the app level (needs lineMapping + vim state). */
  syncCursorToHighlight: () => void
  /** `y` — copy a GitHub link to the highlighted comment. */
  handleCopyLink: (comment: Comment) => void
  /** `o` — open the highlighted comment's file in $EDITOR at its
   *  anchored line. Most useful for outdated threads where the line is
   *  no longer in the diff but still exists in the working copy. */
  handleOpenInEditor: (comment: Comment) => void
  /** `O` — open the images the highlighted comment carries in the browser. */
  handleOpenImages: (comment: Comment) => void
  /** `gx` opens a link in the panel's comments, `gX` copies it (spec 077). */
  onOpenLinks: (comment: Comment, action: "open" | "copy") => void
  /** `g?` — the keymap, which every surface owes the reader. */
  onToggleHelp: () => void
  /** Ctrl-g from the composer — hand the in-progress draft off to
   *  $EDITOR, suspending the TUI, and resolve with the edited text
   *  (or null if the editor errored). Wired at the app level because it
   *  needs renderer suspend/resume. */
  openDraftInEditor: (current: string) => Promise<string | null>
}

// Half-page jump for Ctrl-d / Ctrl-u. Measured in displayOrder entries
// (comments) rather than rows — the panel's scroll follows the
// highlighted comment, so moving the highlight several entries scrolls
// the view by roughly a screenful.
const SCROLL_STEP = 6

// `za` chord state, scoped to the panel input handler. Cleared after the
// follow-up key arrives or the timeout expires so a stray `z` doesn't get
// interpreted as half a chord across unrelated keystrokes.
let pendingZ = false
let pendingZTimeout: ReturnType<typeof setTimeout> | null = null
function clearPendingZ() {
  pendingZ = false
  if (pendingZTimeout) {
    clearTimeout(pendingZTimeout)
    pendingZTimeout = null
  }
}

/**
 * Find the root comment id for a thread containing `commentId`. Used by
 * the expand toggle, which keys on root id.
 */
function findThreadRootId(comments: Comment[], commentId: string): string | null {
  const c = comments.find((x) => x.id === commentId)
  if (!c) return null
  if (!c.inReplyTo) return c.id
  // Replies inherit the root from their parent chain; in practice the
  // groupIntoThreads logic ensures inReplyTo points at the root.
  const parent = comments.find((x) => x.id === c.inReplyTo)
  return parent ? findThreadRootId(comments, parent.id) : c.id
}

/** Put text in at the cursor, leaving the rest of the draft alone. */
function insertAtComposerCursor(text: string): void {
  const at = readComposerCursorOffset()
  replaceComposerRange(at, at, text)
}

/**
 * GitHub applies what is inside a ```suggestion fence to the lines the
 * comment is anchored to. A blank block would delete them, which is a
 * legitimate suggestion — but never the one riff should write for you, so
 * the lines go in as they are and you edit them.
 */
function suggestionBlock(lines: readonly string[]): string {
  return ["```suggestion", ...lines, "```", ""].join("\n")
}

/**
 * `g`-chords, kept here rather than in the global handler: the panel is
 * modal, so a key that reaches it never reaches the chord matcher.
 */
let pendingKey: string | null = null
let pendingTimeout: ReturnType<typeof setTimeout> | null = null

function clearPendingKey(): void {
  pendingKey = null
  if (pendingTimeout) {
    clearTimeout(pendingTimeout)
    pendingTimeout = null
  }
}

export function handleInput(
  key: KeyEvent,
  ctx: InlineCommentOverlayInputContext
): boolean {
  const state = ctx.getState()
  if (!state.inlineCommentOverlay.open) return false

  const ov = state.inlineCommentOverlay
  // displayOrder: matches j/k navigation (resolved threads collapse to root).
  // threadComments: unfiltered, used for thread-level lookups like resolve.
  const threadComments = getInlineCommentOverlayComments(state)
  const displayOrder = getInlineCommentOverlayDisplayOrder(state)

  // Compose/edit always captures (the textarea owns input).
  if (ov.mode === "compose" || ov.mode === "edit") {
    return handleComposerInput(key, ctx)
  }

  // View mode: only act when the panel is the focused surface.
  // Otherwise the user is driving the diff/tree and the panel is
  // just visible — let those handlers process the key.
  if (state.focusedPanel !== "comments") {
    return false
  }

  const highlighted: Comment | undefined = displayOrder[ov.highlightedIndex]

  // The `Ctrl-f` prompt owns every key while it is open, bar the two that
  // close it — the rest belong to the input widget (spec 065).
  if (ov.filterInput) {
    if (key.name === "escape") {
      key.preventDefault()
      ctx.setState(clearViewFilter)
      ctx.render()
    } else if (key.name === "return" || key.name === "enter") {
      key.preventDefault()
      ctx.setState(commitViewFilter)
      ctx.render()
    }
    return true
  }

  // The code peek sits over the panel: while it is up, it owns the keys
  // (spec 060).
  if (ov.codePeekId !== null) {
    if (key.name === "escape" || key.name === "q" || key.name === "c") {
      ctx.setState((s) => setCommentCodePeek(s, null))
      ctx.render()
    }
    return true
  }

  // Ctrl-h — hand focus back to the diff (mirror of file tree's exit).
  // Terminals deliver bare Ctrl-h as `backspace`; we accept both shapes
  // because some emulators (and kitty-protocol terminals) preserve the
  // `h` form.
  if (key.name === "backspace" || (key.ctrl && key.name === "h")) {
    ctx.setState((s) => ({ ...s, focusedPanel: "diff" }))
    ctx.render()
    return true
  }

  // Ctrl-e — toggle expanded width (mirror of file tree's Ctrl-e).
  if (key.ctrl && key.name === "e") {
    ctx.setState((s) => ({
      ...s,
      inlineCommentOverlay: {
        ...s.inlineCommentOverlay,
        expanded: !s.inlineCommentOverlay.expanded,
      },
    }))
    ctx.render()
    return true
  }

  // Ctrl+p falls through so the action menu can open over the overlay
  // (the React… submenu targets the highlighted comment — spec 042).
  if (key.ctrl && key.name === "p") {
    return false
  }

  // Ctrl-f is the file picker, from here as from everywhere: let it through.
  if (key.ctrl && key.name === "f") {
    return false
  }

  // `/` narrows the panel to the comments that match (spec 065).
  if ((key.name === "/" || key.sequence === "/") && !key.ctrl) {
    key.preventDefault()
    ctx.setState(startViewFilter)
    ctx.render()
    return true
  }

  // `y` — copy a link to the highlighted comment. The panel is where the
  // user is looking at a specific thread, so no target resolution needed.
  if (key.name === "y" && !key.ctrl) {
    if (highlighted) ctx.handleCopyLink(highlighted)
    return true
  }

  // Ctrl-t — toggle close (mirrors the diff-view's open binding).
  if (key.ctrl && key.name === "t") {
    ctx.setState(closeInlineCommentOverlay)
    ctx.render()
    return true
  }

  // Ctrl-d / Ctrl-u — half-page scroll. The window follows the
  // highlighted comment, so jumping the highlight several entries
  // scrolls the view. Handled before the `d` (delete) case so Ctrl-d
  // never deletes.
  if (key.ctrl && (key.name === "d" || key.name === "u")) {
    const delta = key.name === "d" ? SCROLL_STEP : -SCROLL_STEP
    ctx.setState((s) => moveInlineCommentOverlayHighlight(s, delta))
    ctx.syncCursorToHighlight()
    ctx.render()
    return true
  }

  // q / Esc — close the panel.
  if (key.name === "escape" || (key.name === "q" && !key.ctrl && !key.shift && !key.meta)) {
    clearPendingZ()
    ctx.setState(closeInlineCommentOverlay)
    ctx.render()
    return true
  }

  // za chord (vim-style "toggle fold") — expand/collapse the highlighted
  // thread. Resolved threads reveal their body + replies; outdated threads
  // reveal the original diff hunk.
  const toggleHighlightedThread = () => {
    if (!highlighted) return
    const rootId = findThreadRootId(threadComments, highlighted.id) ?? highlighted.id
    ctx.setState((s) => toggleInlineCommentOverlayExpand(s, rootId))
    ctx.render()
  }

  if (pendingZ) {
    clearPendingZ()
    if (key.name === "a" && !key.ctrl && !key.shift) {
      toggleHighlightedThread()
      return true
    }
    // Anything else after `z` cancels the chord; fall through so the key
    // still gets processed normally.
  }

  if (key.name === "z" && !key.ctrl && !key.shift) {
    pendingZ = true
    pendingZTimeout = setTimeout(clearPendingZ, 500)
    return true
  }

  if (pendingKey === "g") {
    clearPendingKey()
    // `gx` — the links in the highlighted comment (spec 077). Every other
    // g-sequence is swallowed rather than falling through into the
    // panel's own `r`/`e`/`d` handlers.
    if (key.name === "?" || key.sequence === "?") {
      ctx.onToggleHelp()
      return true
    }
    if ((key.name === "x" || key.name === "X") && highlighted) {
      // preventDefault so the picker's prompt field, focused in this same
      // keypress, does not read the `x` as the start of a query.
      key.preventDefault()
      ctx.onOpenLinks(highlighted, key.shift || key.name === "X" ? "copy" : "open")
    }
    return true
  }

  if (key.name === "g" && !key.shift && !key.ctrl) {
    pendingKey = "g"
    pendingTimeout = setTimeout(clearPendingKey, 500)
    return true
  }

  // Enter is an alias for `za` — toggle expand on the highlighted thread.
  if (key.name === "return" || key.name === "enter") {
    toggleHighlightedThread()
    return true
  }

  switch (key.name) {
    case "j":
    case "down":
      if (key.shift) {
        // J — jump to next thread (re-anchors the overlay).
        ctx.handleJumpAdjacent(1)
        return true
      }
      ctx.setState((s) => moveInlineCommentOverlayHighlight(s, 1))
      ctx.syncCursorToHighlight()
      ctx.render()
      return true

    case "k":
    case "up":
      if (key.shift) {
        // K — jump to previous thread.
        ctx.handleJumpAdjacent(-1)
        return true
      }
      ctx.setState((s) => moveInlineCommentOverlayHighlight(s, -1))
      ctx.syncCursorToHighlight()
      ctx.render()
      return true

    case "n":
      // Ctrl-n kept as an alias for next-thread (legacy muscle memory).
      // The visible binding is `J`.
      if (key.ctrl) {
        ctx.handleJumpAdjacent(1)
        return true
      }
      // Bare `n` starts a new comment at the diff cursor's line —
      // mirrors the diff's `n`-for-new convention but only fires while
      // the panel is the focused surface so vim's `n` (search-next)
      // stays available everywhere else. preventDefault so the textarea
      // (focused during the sync re-render) doesn't also see this `n`.
      if (!key.shift) {
        key.preventDefault()
        ctx.handleStartNewComment()
        return true
      }
      break

    case "r":
      if (key.shift) {
        // R — reply via $EDITOR
        ctx.setState(closeInlineCommentOverlay)
        ctx.render()
        ctx.handleReplyExternal()
        return true
      }
      // r — inline reply: re-anchor to the highlighted thread's
      // (file, line, side) so the new comment lands in the right place,
      // then drop into the composer. Without re-anchoring, replying
      // after j/k navigation (or in all-files view, after crossing
      // files) would attach to whatever the panel was originally
      // opened on. preventDefault so the textarea (focused during the
      // sync re-render) doesn't also see this `r`.
      key.preventDefault()
      if (highlighted) {
        ctx.setState((s) => startInlineCompose({
          ...s,
          inlineCommentOverlay: {
            ...s.inlineCommentOverlay,
            filename: highlighted.filename,
            line: highlighted.line,
            side: highlighted.side,
          },
        }, "", { reply: true }))
      } else {
        ctx.setState((s) => startInlineCompose(s, "", { reply: true }))
      }
      ctx.render()
      return true

    case "e":
      if (key.shift) {
        // E — edit via $EDITOR
        ctx.setState(closeInlineCommentOverlay)
        ctx.render()
        ctx.handleEditExternal()
        return true
      }
      // e — inline edit. Only the highlighted comment can be edited
      // and only if it has a body to edit (defensive — every comment
      // has a body, but mid-mutation states might race). preventDefault
      // so the textarea (focused during the sync re-render) doesn't
      // also see this `e`.
      if (highlighted) {
        key.preventDefault()
        const prefill = highlighted.localEdit ?? highlighted.body
        ctx.setState((s) => startInlineEdit(s, highlighted.id, prefill))
        ctx.render()
      }
      return true

    case "d":
      if (highlighted) ctx.handleDelete(highlighted)
      return true

    case "x": {
      if (!highlighted) return true
      const threads = groupIntoThreads(threadComments)
      const thread = threads.find((t) =>
        t.comments.some((c) => c.id === highlighted.id)
      )
      if (thread) ctx.handleToggleResolved(thread)
      return true
    }

    case "s":
      // Bare `s` is flash's: the global handler labels the panel's rows
      // (spec 066). `S` posts the highlighted comment.
      if (!key.shift && !key.ctrl) return false
      if (key.shift && highlighted) {
        if (
          highlighted.status === "local" ||
          highlighted.localEdit !== undefined
        ) {
          ctx.handleSubmit(highlighted)
        }
      }
      return true

    case "c": {
      // The code this comment was written against — the only copy of it
      // riff has once the thread has gone outdated (spec 060).
      if (key.ctrl || key.shift || !highlighted) return true
      key.preventDefault()
      if (!commentHunk(threadComments, highlighted.id)) {
        ctx.setState((s) =>
          showToast(s, "No stored context for this comment", "info")
        )
        ctx.render()
        setTimeout(() => {
          ctx.setState(clearToast)
          ctx.render()
        }, 2000)
        return true
      }
      ctx.setState((s) => setCommentCodePeek(s, highlighted.id))
      ctx.render()
      return true
    }

    case "o":
      if (key.ctrl) return true
      key.preventDefault()
      if (highlighted) {
        // O — the panel can only name a comment's images; the browser is
        // where they can actually be seen (and, for a private repo, the
        // only place authenticated to fetch them at all).
        if (key.shift) ctx.handleOpenImages(highlighted)
        // o — open the comment's file in $EDITOR at its line. Not gated on
        // outdated specifically — works for any thread, just happens to be
        // the only way to inspect outdated context.
        else ctx.handleOpenInEditor(highlighted)
      }
      return true
  }

  // Everything else is swallowed while the overlay is open (modal).
  return true
}

function handleComposerInput(
  key: KeyEvent,
  ctx: InlineCommentOverlayInputContext
): boolean {
  const state = ctx.getState()
  const ov = state.inlineCommentOverlay

  // @mention picker — intercept navigation/commit keys while the picker
  // is open. Done before generic Esc/Ctrl-s handling so the picker can
  // own those keys. Typing characters falls through to the textarea so
  // the query expands naturally; the textarea's onContentChange then
  // updates the picker via render-time activity dispatch.
  if (ov.mentionPicker) {
    const handled = handleMentionPickerInput(key, ctx, ov.mentionPicker)
    if (handled) return true
  }

  // Ctrl-g — hand the draft off to $EDITOR (like shell Ctrl-x Ctrl-e).
  // The textarea's live value is the source of truth (the user may have
  // typed since compose/edit started), and the edited result flows back
  // into the same textarea so Ctrl-s still submits it.
  if (key.ctrl && key.name === "g") {
    key.preventDefault()
    const current = readComposerValue()
    void (async () => {
      const edited = await ctx.openDraftInEditor(current)
      if (edited !== null) {
        setComposerValue(edited)
        ctx.setState((s) => setInlineCommentInput(s, edited))
      }
      ctx.render()
    })()
    return true
  }

  // Ctrl-y — a GitHub suggestion block, prefilled with the lines this
  // comment replaces, so the edit is made in place rather than described
  // (spec 076). On a comment written against a block that is the whole
  // block; on one line, that line.
  if (key.ctrl && key.name === "y") {
    key.preventDefault()
    const lines = ctx.getCommentedLines()
    if (lines === null) {
      ctx.setState((s) => showToast(s, "Nothing to suggest — riff cannot read those lines", "info"))
      ctx.render()
      setTimeout(() => {
        ctx.setState(clearToast)
        ctx.render()
      }, 2500)
      return true
    }
    insertAtComposerCursor(suggestionBlock(lines))
    ctx.setState((s) => setInlineCommentInput(s, readComposerValue()))
    ctx.render()
    return true
  }

  // Esc — cancel back to view mode, keeping what was typed as a draft on
  // this line (spec 061). The textarea's live value is the source of truth:
  // state mirrors keystrokes, but reading the composer cannot be stale.
  // We `preventDefault` so the focused textarea doesn't also process it.
  if (key.name === "escape") {
    key.preventDefault()
    const draft = readComposerValue()
    ctx.setState((s) => cancelInlineComposer(rememberCommentDraft(s, draft)))
    ctx.render()
    if (draft.trim()) {
      ctx.setState((s) => showToast(s, "Draft kept for this line", "info"))
      ctx.render()
      setTimeout(() => {
        ctx.setState(clearToast)
        ctx.render()
      }, 2000)
    }
    return true
  }

  // Enter / Ctrl-s save the draft locally; Ctrl-p ("post") saves and
  // pushes it to GitHub in one keystroke. Ctrl-J stays the newline.
  // Enter can afford to be the save key here because saving is local —
  // publishing is the deliberate chord, not the bare one.
  //
  // Ctrl-Enter is bound to publish as well, but only terminals sending
  // the kitty `CSI 13;5u` form deliver it; tmux drops the modifier
  // unless `extended-keys on`, and it then arrives indistinguishable
  // from a bare Enter and silently degrades to save-only. Ctrl-p is a
  // plain control byte, so it survives every terminal and multiplexer —
  // that's the one the hint rows name.
  //
  // Ctrl-p doesn't collide with the command palette: the palette is
  // unreachable from compose mode, which swallows everything it doesn't
  // handle, and the textarea binds no Ctrl-p of its own.
  //
  // preventDefault keeps the textarea from turning Enter into a newline.
  // The live textarea value goes into state first so the submit handlers
  // (which still read `ov.input`) see what the user actually typed.
  // Publishing needs a PR on the other end; in local mode the chord just saves.
  const publish =
    ctx.getState().appMode === "pr" &&
    ((key.ctrl && key.name === "p") || (key.ctrl && key.name === "return"))
  const saveChord = publish || (key.ctrl && key.name === "s") || key.name === "return"
  if (saveChord) {
    key.preventDefault()
    const value = readComposerValue()
    ctx.setState((s) => setInlineCommentInput(s, value))
    const saving = ov.mode === "edit" ? submitInlineEditDraft(ctx) : submitInlineDraft(ctx)
    void saving.then((saved) => {
      if (publish && saved) ctx.handleSubmit(saved)
    })
    return true
  }

  // All other keys flow to the focused TextareaRenderable via OpenTUI's
  // internal renderable dispatch — that's where typing, paste, Ctrl-w,
  // arrow keys, undo/redo, mouse selection, etc. are handled. We return
  // `true` to short-circuit our own outer handler chain (so global keys
  // don't fire) but skip `preventDefault` so the textarea still sees
  // the event.
  return true
}

/**
 * Handle keys while the @mention picker is open. Returns `true` if the
 * picker consumed the key, leaving the outer composer handler to skip
 * its own logic. Typing characters returns `false` so they flow to the
 * textarea (extending the query, which the activity callback then
 * re-runs through `detectMentionTrigger`).
 */
function handleMentionPickerInput(
  key: KeyEvent,
  ctx: InlineCommentOverlayInputContext,
  picker: NonNullable<AppState["inlineCommentOverlay"]["mentionPicker"]>
): boolean {
  const state = ctx.getState()
  const candidates = collectMentionCandidates(state)
  const filtered = getFilteredMentionCandidates(candidates, picker.query)

  // Esc — dismiss the picker but leave the composer (and the typed
  // `@<query>`) intact. preventDefault so the textarea doesn't also
  // see Esc and the surrounding handler doesn't cancel compose.
  if (key.name === "escape") {
    key.preventDefault()
    ctx.setState((s) => setMentionPicker(s, null))
    ctx.render()
    return true
  }

  if (key.name === "up" || (key.ctrl && key.name === "p")) {
    key.preventDefault()
    if (filtered.length > 0) {
      ctx.setState((s) => moveMentionPickerSelection(s, -1, filtered.length))
      ctx.render()
    }
    return true
  }

  if (key.name === "down" || (key.ctrl && key.name === "n")) {
    key.preventDefault()
    if (filtered.length > 0) {
      ctx.setState((s) => moveMentionPickerSelection(s, 1, filtered.length))
      ctx.render()
    }
    return true
  }

  // Tab or Enter — accept the highlighted candidate. Only commit when
  // the picker has at least one match; otherwise fall through so Enter
  // inserts a newline and Tab inserts a tab in the textarea.
  if ((key.name === "tab" || key.name === "return" || key.name === "enter") && filtered.length > 0) {
    key.preventDefault()
    const idx = Math.min(picker.selectedIndex, filtered.length - 1)
    const username = filtered[idx]
    if (!username) return true
    acceptMention(ctx, picker.atOffset, username)
    return true
  }

  return false
}

/**
 * Replace the active `@<query>` with `@<username> ` in the textarea
 * and close the picker. The textarea's onContentChange fires after
 * `replaceComposerRange`, which re-runs `detectMentionTrigger`; with
 * the trailing space the regex no longer matches, so the picker stays
 * closed.
 */
function acceptMention(
  ctx: InlineCommentOverlayInputContext,
  atOffset: number,
  username: string
): void {
  const cursor = readComposerCursorOffset()
  replaceComposerRange(atOffset, cursor, `@${username} `)
  // Defensive: clear the picker explicitly even though the activity
  // callback will also clear it. Avoids a one-frame flash if the event
  // ordering ever changes.
  ctx.setState((s) => setMentionPicker(s, null))
  ctx.render()
}

