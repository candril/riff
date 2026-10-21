import { getInlineCommentOverlayComments, type AppState } from "../state"

/**
 * What is on screen has been read (spec 069): the comments the panel is
 * showing, and the threads of an open Conversation section. Being in the
 * PR is not the same as having read it, so nothing else counts.
 */
export function commentsSeenOnScreen(state: AppState, { conversationOpen }: { conversationOpen: boolean }): string[] {
  const seen: string[] = []
  if (state.inlineCommentOverlay.open) {
    for (const comment of getInlineCommentOverlayComments(state)) seen.push(comment.id)
  }
  if (state.viewMode === "state" && conversationOpen) {
    for (const comment of state.comments) seen.push(comment.id)
  }
  return seen
}
