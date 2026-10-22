/**
 * The overview's comment prompt (`c` in the conversation section): the text
 * of a PR-level comment while it is written and posted. It is the
 * overview's sub-modal, not review state: nothing in the review reads it,
 * and it lives only until the comment posts or the prompt is dismissed. The
 * feature owns it rather than AppState, which sheds one slice per feature
 * this way (spec 100, M6; ADR-003).
 */

import { createSignal } from "solid-js"

export type PrCommentInputState = ReturnType<typeof createPrCommentInputState>

interface PrCommentInput {
  open: boolean
  text: string
  loading: boolean
  error: string | null
}

const CLOSED: PrCommentInput = { open: false, text: "", loading: false, error: null }

export function createPrCommentInputState() {
  const [input, setInput] = createSignal<PrCommentInput>(CLOSED)

  return {
    current: input,
    isOpen: () => input().open,
    open() {
      setInput({ ...CLOSED, open: true })
    },
    close() {
      setInput(CLOSED)
    },
    setText(text: string) {
      setInput((prev) => ({ ...prev, text }))
    },
    setLoading(loading: boolean) {
      setInput((prev) => ({ ...prev, loading }))
    },
    setError(error: string | null) {
      setInput((prev) => ({ ...prev, error }))
    },
  }
}
