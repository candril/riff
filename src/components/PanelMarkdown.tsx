import { MarkdownRenderable } from "@opentui/core"
import { useRenderer } from "@opentui/solid"
import { createEffect, For } from "solid-js"
import type { Segment } from "./pr-info-conversation-parts"

/** How a panel draws markdown: its table renderer and its syntax colours. */
export type PanelMarkdownStyle = Pick<ConstructorParameters<typeof MarkdownRenderable>[1], "renderNode" | "syntaxStyle">

/**
 * A markdown body in the PR info panel or the thread panel, its text the
 * markdown as drawn.
 *
 * The body is built here, with its style in its constructor, rather than as
 * a `<markdown>` element: Solid hands an element its props after it is
 * made, and in OpenTUI 0.6.0 a syntax style set after construction, on a
 * body with a renderNode, redraws its list items empty until the
 * highlighter answers — a frame or more of bullets with no words.
 */
export function PanelMarkdown(props: { id: string; text: string; style: PanelMarkdownStyle }) {
  const body = new MarkdownRenderable(useRenderer(), {
    ...props.style,
    id: props.id,
    content: props.text,
    // Nothing streams here — but streaming is what makes OpenTUI lay the
    // text down from the markdown tokens up front instead of waiting on the
    // highlighter, so the first frame a body appears on is the frame it
    // reads on.
    streaming: true,
  })
  createEffect(() => {
    body.content = props.text
  })
  return body
}

/** Reactions as a row of pills, each padded a cell either side. */
export function Pills(props: { indent: number; pills: Segment[] }) {
  return (
    <box flexDirection="row" paddingLeft={props.indent}>
      <For each={props.pills}>
        {(pill) => (
          <box flexDirection="row" paddingX={1} marginRight={1}>
            <text fg={pill.fg}>{pill.text}</text>
          </box>
        )}
      </For>
    </box>
  )
}
