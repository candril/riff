/**
 * What the thread panel's composer and its two pickers do with the keys
 * `composer-keys.ts` binds (spec 039).
 */

import {
  cancelInlineComposer,
  clearToast,
  moveEmojiPickerSelection,
  moveMentionPickerSelection,
  rememberCommentDraft,
  setEmojiPicker,
  setInlineCommentInput,
  setMentionPicker,
  showToast,
} from "../../state"
import { filterEmoji } from "../../utils/emoji"
import { collectMentionCandidates } from "../../utils/mentions"
import { getFilteredMentionCandidates } from "../../components/thread-panel-picker"
import type { ComposerHandle } from "../../app/island-composer"
import type { InputPicker } from "../../app/at-picker-keys"
import { submitInlineDraft, submitInlineEditDraft } from "./handlers"
import type { ComposerKeyDeps } from "./composer-keys"

/**
 * Ctrl-g, like shell Ctrl-x Ctrl-e. The textarea's live value is the source
 * of truth (the user may have typed since compose/edit started), and the
 * edited result flows back into the same textarea so Ctrl-s still submits it.
 */
export function editDraftInEditor(deps: ComposerKeyDeps): void {
  const current = deps.composer.value()
  void (async () => {
    const edited = await deps.openDraftInEditor(current)
    if (edited !== null) {
      deps.composer.setValue(edited)
      deps.setState((s) => setInlineCommentInput(s, edited))
    }
    deps.render()
  })()
}

/**
 * Ctrl-y: a suggestion block prefilled with the lines this comment replaces,
 * so the edit is made in place rather than described (spec 076). On a
 * comment written against a block that is the whole block; on one line,
 * that line.
 */
export function insertSuggestion(deps: ComposerKeyDeps): void {
  const lines = deps.getCommentedLines()
  if (lines === null) {
    deps.setState((s) => showToast(s, "Nothing to suggest — riff cannot read those lines", "info"))
    deps.render()
    setTimeout(() => {
      deps.setState(clearToast)
      deps.render()
    }, 2500)
    return
  }
  insertAtComposerCursor(deps.composer, suggestionBlock(lines))
  deps.setState((s) => setInlineCommentInput(s, deps.composer.value()))
  deps.render()
}

/**
 * Esc: back to view mode, keeping what was typed as a draft on this line
 * (spec 061). State mirrors keystrokes, but reading the composer cannot be stale.
 */
export function cancelComposer(deps: ComposerKeyDeps): void {
  const draft = deps.composer.value()
  deps.setState((s) => cancelInlineComposer(rememberCommentDraft(s, draft)))
  deps.composerSettled?.("dropped")
  deps.render()
  // A proposal of the agent's dropped untouched is forgotten, not kept.
  const kept = draft.trim() !== "" && [...deps.getState().commentDrafts.values()].includes(draft)
  if (kept) {
    deps.setState((s) => showToast(s, "Draft kept for this line", "info"))
    deps.render()
    setTimeout(() => {
      deps.setState(clearToast)
      deps.render()
    }, 2000)
  }
}

/**
 * Saves the draft locally and, when `publish`, pushes it to GitHub too. The
 * live textarea value goes into state first so the submit handlers (which
 * still read `ov.input`) see what the user actually typed.
 */
export function saveDraft(deps: ComposerKeyDeps, publish: boolean): void {
  const editing = deps.getState().inlineCommentOverlay.mode === "edit"
  const value = deps.composer.value()
  deps.setState((s) => setInlineCommentInput(s, value))
  const saving = editing ? submitInlineEditDraft(deps) : submitInlineDraft(deps)
  // The handlers change state before their first await, so the outcome is already there.
  deps.composerSettled?.(publish ? "published" : "saved")
  void saving.then((saved) => {
    if (publish && saved) deps.handleSubmit(saved)
  })
}

export function emojiPicker(deps: ComposerKeyDeps): InputPicker {
  const picker = () => deps.getState().inlineCommentOverlay.emojiPicker
  const matches = () => filterEmoji(picker()?.query ?? "")
  return {
    open: () => picker() !== null,
    matches: () => matches().length,
    close: () => {
      deps.setState((s) => setEmojiPicker(s, null))
      deps.render()
    },
    move: (delta) => {
      const count = matches().length
      deps.setState((s) => moveEmojiPickerSelection(s, delta, count))
      deps.render()
    },
    accept: () => {
      const open = picker()
      const found = matches()
      const chosen = open && found[Math.min(open.selectedIndex, found.length - 1)]
      if (!chosen) return
      // The emoji itself rather than its shortcode: GitHub renders both, and
      // only one of them is legible in riff's own panel.
      deps.composer.replaceRange(open.colonOffset, deps.composer.cursorOffset(), `${chosen.char} `)
      deps.setState((s) => setEmojiPicker(s, null))
      deps.render()
    },
  }
}

export function mentionPicker(deps: ComposerKeyDeps): InputPicker {
  const picker = () => deps.getState().inlineCommentOverlay.mentionPicker
  const matches = () => getFilteredMentionCandidates(collectMentionCandidates(deps.getState(), deps.mentions.pool()), picker()?.query ?? "")
  return {
    open: () => picker() !== null,
    matches: () => matches().length,
    close: () => {
      deps.setState((s) => setMentionPicker(s, null))
      deps.render()
    },
    move: (delta) => {
      const count = matches().length
      deps.setState((s) => moveMentionPickerSelection(s, delta, count))
      deps.render()
    },
    accept: () => {
      const open = picker()
      const found = matches()
      const username = open && found[Math.min(open.selectedIndex, found.length - 1)]
      if (!username) return
      acceptMention(deps, open.atOffset, username)
    },
  }
}

/**
 * The textarea's onContentChange fires after `replaceRange` and re-runs
 * `detectAtTrigger`; with the trailing space the regex no longer
 * matches, so the picker stays closed.
 */
function acceptMention(deps: ComposerKeyDeps, atOffset: number, username: string): void {
  const cursor = deps.composer.cursorOffset()
  deps.composer.replaceRange(atOffset, cursor, `@${username} `)
  // Cleared here as well as by the content callback, so no frame shows the
  // picker over the finished mention should that callback ever come later.
  deps.setState((s) => setMentionPicker(s, null))
  deps.render()
}

function insertAtComposerCursor(composer: ComposerHandle, text: string): void {
  const at = composer.cursorOffset()
  composer.replaceRange(at, at, text)
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
