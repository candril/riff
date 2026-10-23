import { collectMentionCandidates, detectAtTrigger, MENTION_QUERY_CHARS } from "../utils/mentions"
import { detectEmojiTrigger } from "../utils/emoji"
import type { AppState } from "../state"
import { requestMentionSearch } from "../features/mentions"
import type { ComposerSession } from "./composer-session"
import type { ComposerModel } from "./composer-model"
import type { MentionsState } from "../features/mentions/state"
import type { ComposerPickersState } from "../features/inline-comment-overlay/composer-pickers-state"

export interface ComposerFollowerDeps {
  getState: () => AppState
  render: () => void
  mentions: MentionsState
  composerPickers: Pick<ComposerPickersState, "setMention" | "setEmoji">
}

/**
 * Hands each frame's composer session to the thread panel's textarea, which
 * focuses and seeds it.
 */
export function createComposerFollower(
  compose: (session: ComposerSession | null) => void,
  { getState, render, mentions, composerPickers }: ComposerFollowerDeps
) {
  const onActivity = (text: string, cursorOffset: number) => {
    const trigger = detectAtTrigger(text, cursorOffset, MENTION_QUERY_CHARS)
    // The textarea lives as long as the island, so it can report activity
    // with no panel open; a picker set then would come up under the next
    // composer.
    if (getState().inlineCommentOverlay.open) {
      composerPickers.setMention(trigger)
      // And `:shortcode`, which needs nothing fetched (spec 082).
      composerPickers.setEmoji(detectEmojiTrigger(text, cursorOffset))
    }
    if (trigger) {
      // Widen the pool for fragments the cached roster can't cover
      // (large orgs) — debounced, so this is a no-op most keystrokes.
      requestMentionSearch({ mentions, render }, trigger.query, collectMentionCandidates(getState(), mentions.pool()))
    }
    render()
  }
  return {
    update(model: ComposerModel | null): void {
      compose(model && { ...model, onActivity })
    },
  }
}
