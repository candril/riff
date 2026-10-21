import type { TextareaRenderable } from "@opentui/core"
import { theme } from "../theme"

/**
 * The inline comment overlay's multiline input (spec 039), shown by the
 * thread panel in compose / edit mode. It is OpenTUI's native textarea, so
 * cursor, paste, undo/redo, Ctrl-w, Alt-arrow word jumps and mouse
 * selection are the widget's behaviour rather than riff's. The island that
 * draws the panel mounts it once and keeps it, which is what keeps the
 * cursor, selection and undo history across re-renders.
 */
export function CommentComposer(props: {
  ref: (textarea: TextareaRenderable) => void
  placeholder: string
  onActivity: () => void
}) {
  return (
    <textarea
      id="inline-comment-composer"
      ref={props.ref}
      backgroundColor={theme.surface0}
      textColor={theme.text}
      focusedBackgroundColor={theme.surface0}
      focusedTextColor={theme.text}
      placeholder={props.placeholder}
      placeholderColor={theme.overlay0}
      cursorColor={theme.blue}
      cursorStyle={{ style: "block", blinking: true }}
      wrapMode="word"
      maxHeight={12}
      onContentChange={() => props.onActivity()}
      onCursorChange={() => props.onActivity()}
    />
  )
}
