/**
 * The typing session of the inline comment composer (spec 039): which
 * comment is being composed or edited in its textarea, and who hears about
 * typing. The island that draws the textarea owns one of these and is
 * handed its session on every pass.
 */

import type { TextareaRenderable } from "@opentui/core"
import { replaceTextRange } from "./textarea-range"

// The composer's keys are listed in the help overlay (g?). Ctrl-g alone is
// named here, as the way out to a roomier editor: the textarea is only as
// wide as the thread panel, and a placeholder that wraps eats the typing area.
export const PLACEHOLDER_COMPOSE = "Type a comment… (Ctrl-g for $EDITOR)"
export const PLACEHOLDER_EDIT = "Edit comment… (Ctrl-g for $EDITOR)"

/** What of OpenTUI's textarea the session drives. */
export interface ComposerTextarea {
  readonly plainText: string
  cursorOffset: number
  placeholder: TextareaRenderable["placeholder"]
  setText(text: string): void
  replaceText(text: string): void
  focus(): void
  blur(): void
}

/**
 * Fires after every content or cursor change so the @mention and :emoji
 * pickers can tell whether a trigger is being typed.
 */
export type ComposerActivity = (text: string, cursorOffset: number) => void

export interface ComposerSession {
  /** Anchor, mode and edited comment together: a new key re-seeds the
   *  textarea, so switching from compose to edit on one line starts afresh. */
  key: string
  initialValue: string
  mode: "compose" | "edit"
  onActivity?: ComposerActivity
}

export function createComposerSession(textarea: () => ComposerTextarea) {
  let key: string | null = null
  let activityHandler: ComposerActivity | null = null

  return {
    /** Re-seeding only on a new key is what keeps a re-render mid-typing from trampling the text. */
    sync(session: ComposerSession | null): void {
      if (!session) {
        if (key === null) return
        key = null
        activityHandler = null
        textarea().blur()
        return
      }
      // Refreshed on every pass so the handler never closes over stale state.
      activityHandler = session.onActivity ?? null
      if (key === session.key) return
      key = session.key
      const ta = textarea()
      ta.placeholder = session.mode === "edit" ? PLACEHOLDER_EDIT : PLACEHOLDER_COMPOSE
      ta.setText(session.initialValue)
      ta.focus()
    },
    value(): string {
      return textarea().plainText
    },
    cursorOffset(): number {
      return textarea().cursorOffset
    },
    /**
     * For a draft edited out of band in $EDITOR (Ctrl-g) or filled from a
     * proposal. The key stays, so the next sync counts the session as
     * already seeded and keeps this text.
     */
    setValue(text: string): void {
      const ta = textarea()
      ta.setText(text)
      ta.cursorOffset = text.length
      ta.focus()
    },
    replaceRange(start: number, end: number, replacement: string): void {
      replaceTextRange(textarea(), start, end, replacement)
    },
    activity(): void {
      if (!activityHandler) return
      const ta = textarea()
      activityHandler(ta.plainText, ta.cursorOffset)
    },
  }
}
