import { MarkdownRenderable } from "@opentui/core"
import { useRenderer } from "@opentui/solid"
import { createEffect, Show } from "solid-js"
import { chatColors, chatSyntaxStyle } from "./markdown-style"
import type { Entry } from "./entries"

/**
 * Built with its style in the constructor rather than as a `<markdown>`
 * element, for the reason PanelMarkdown gives: in OpenTUI 0.6.0 a style set
 * after construction draws list items empty until the highlighter answers.
 */
function Answer(props: { text: string }) {
  const renderer = useRenderer()
  const body = new MarkdownRenderable(renderer, {
    syntaxStyle: chatSyntaxStyle(renderer),
    content: props.text,
    // Streaming lays the text down from the tokens up front, so a finished
    // answer reads on the frame it appears rather than after the highlighter.
    streaming: true,
  })
  createEffect(() => {
    body.content = props.text
  })
  return body
}

const sentWith = (question: Extract<Entry, { kind: "question" }>) =>
  [question.position?.label, ...question.labels].filter(Boolean).join("  ")

// <For> hands each EntryView one entry for its whole life; its kind never changes.
export function EntryView(props: { entry: Entry; paused: boolean }) {
  const entry = props.entry
  if (entry.kind === "question") {
    return (
      <box flexDirection="column" marginTop={1} marginBottom={1}>
        <Show when={sentWith(entry)}>
          {/* One line however much went along; the column cuts it rather than growing taller. */}
          {(label: () => string) => (
            <text fg={chatColors.dim} wrapMode="none">
              {label()}
            </text>
          )}
        </Show>
        <text fg={chatColors.question}>
          {`› ${entry.text}${entry.waiting ? (props.paused ? "  (paused)" : "  (waiting)") : ""}`}
        </text>
      </box>
    )
  }
  if (entry.kind === "note") {
    return (
      <text fg={entry.tone === "error" ? chatColors.error : chatColors.dim} marginTop={1}>
        {entry.text}
      </text>
    )
  }
  return (
    <box flexDirection="column">
      <Answer text={entry.text} />
      <Show when={entry.interrupted}>
        <text fg={chatColors.dim}>— interrupted</text>
      </Show>
    </box>
  )
}
