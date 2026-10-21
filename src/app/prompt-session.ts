/**
 * The typing session of one prompt's field (spec 065): which prompt is
 * typing into it, and where what is typed and Enter go. The island that
 * draws the field owns one of these and is handed its session on every pass.
 */

/** What of OpenTUI's input the session drives. */
export interface PromptField {
  value: string
  placeholder: string
  focus(): void
  blur(): void
}

export interface PromptSession {
  /** The prompt this is. A new key re-seeds the field and takes focus. */
  key: string
  /** What the field starts with — a filter being refined rather than restarted. */
  initialValue: string
  placeholder?: string
  onChange: (value: string) => void
  /** Enter, when the prompt wants it. Most prompts take Enter in their own
   *  key handling instead, where they can act on the selected row. */
  onSubmit?: () => void
}

export function createPromptSession(field: () => PromptField) {
  let key: string | null = null
  let changeHandler: ((value: string) => void) | null = null
  let submitHandler: (() => void) | null = null

  return {
    /**
     * Re-seeding only on a new key is what keeps a re-render mid-typing
     * from resetting the cursor.
     */
    sync(session: PromptSession | null): void {
      if (!session) {
        if (key === null) return
        field().blur()
        key = null
        changeHandler = null
        submitHandler = null
        return
      }
      submitHandler = session.onSubmit ?? null
      if (key !== session.key) {
        const input = field()
        if (key !== null) input.blur()
        key = session.key
        input.placeholder = session.placeholder ?? ""
        // Seeding is not typing. A field reopened with its last session's text
        // reports the reset as input, and that handler re-renders from inside the
        // render opening the prompt — which then mounts the app a second time.
        changeHandler = null
        input.value = session.initialValue
        input.focus()
      }
      changeHandler = session.onChange
    },
    value(): string {
      return field().value
    },
    input(value: string): void {
      changeHandler?.(value)
    },
    submit(): void {
      submitHandler?.()
    },
  }
}
