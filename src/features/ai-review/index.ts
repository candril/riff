/**
 * AI Review feature
 *
 * Discuss a selection, folder, file, or the whole review with Claude Code
 * in a tmux split pane (or inline when not inside tmux).
 */

export {
  handleAiReviewContextAware,
  handleAiReviewFull,
  type AiReviewContext,
} from "./handlers"
export { detectReviewScope } from "./scope"
