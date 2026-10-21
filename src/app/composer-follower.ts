import { collectMentionCandidates, detectMentionTrigger } from "../utils/mentions"
import { detectEmojiTrigger } from "../utils/emoji"
import { setEmojiPicker, setMentionPicker, type AppState } from "../state"
import { requestMentionSearch } from "../features/mentions"
import type { ComposerSession } from "./composer-session"
import type { ComposerModel } from "./composer-model"

export interface ComposerFollowerDeps {
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
}

/**
 * Hands each frame's composer session to the thread panel's textarea, which
 * focuses and seeds it. Composing hides the diff's cursor, which keeps the
 * textarea's cursor visible; otherwise the diff would re-claim it after the
 * textarea's renderCursor pass.
 */
export function createComposerFollower(
  compose: (session: ComposerSession | null) => void,
  { getState, setState, render }: ComposerFollowerDeps
) {
  const onActivity = (text: string, cursorOffset: number) => {
    // Detect `@<query>` against the live textarea state. The
    // mention picker is feature-gated to PR mode (no candidates
    // in local diff review) — `setMentionPicker` short-circuits
    // when there's nothing to set.
    const trigger = detectMentionTrigger(text, cursorOffset)
    setState((s) => setMentionPicker(s, trigger))
    // And `:shortcode`, which needs nothing fetched (spec 082).
    setState((s) => setEmojiPicker(s, detectEmojiTrigger(text, cursorOffset)))
    if (trigger) {
      // Widen the pool for fragments the cached roster can't cover
      // (large orgs) — debounced, so this is a no-op most keystrokes.
      requestMentionSearch({ setState, render }, trigger.query, collectMentionCandidates(getState()))
    }
    render()
  }
  return {
    update(model: ComposerModel | null): void {
      compose(model && { ...model, onActivity })
    },
  }
}
