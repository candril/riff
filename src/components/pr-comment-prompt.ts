import { theme } from "../theme"

export interface PrCommentPromptInput {
  open: boolean
  text: string
  loading: boolean
  error: string | null
}

/** What the `gC` prompt says, and in which colours. */
export interface PrCommentPromptModel {
  text: string
  textFg: string
  status: string
  statusFg: string
}

const PLACEHOLDER = "Type your comment..."

/** The prompt as drawn, or null while it is closed. */
export function prCommentPromptModel({ open, text, loading, error }: PrCommentPromptInput): PrCommentPromptModel | null {
  if (!open) return null
  return {
    text: text || PLACEHOLDER,
    textFg: text ? theme.text : theme.overlay0,
    ...promptStatus(loading, error),
  }
}

function promptStatus(loading: boolean, error: string | null): { status: string; statusFg: string } {
  if (loading) return { status: "Submitting...", statusFg: theme.yellow }
  if (error) return { status: error, statusFg: theme.red }
  return { status: "Enter to submit", statusFg: theme.overlay0 }
}
