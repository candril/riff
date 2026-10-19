import { MarkdownRenderable, type Renderable } from "@opentui/core"
import { useRenderer } from "@opentui/solid"
import { createEffect, For, Match, Show, Switch } from "solid-js"
import { colors, theme } from "../theme"
import type { Segment } from "./pr-info-conversation-parts"
import type { BodyPart, ConversationRow, ConversationRows, HeaderSegment } from "./pr-info-conversation-rows"

/** How the panel draws markdown: its table renderer and its syntax colours. */
export type ConversationMarkdown = Pick<ConstructorParameters<typeof MarkdownRenderable>[1], "renderNode" | "syntaxStyle">
type Item = Extract<ConversationRow, { kind: "item" }>
type Reviewers = Extract<ConversationRow, { kind: "reviewers" }>
type Part<K extends BodyPart["kind"]> = Extract<BodyPart, { kind: K }>
type OnRow = ((key: string, header: Renderable) => void) | undefined

/**
 * The PR info panel's conversation: a one-row header per item with what it
 * opens onto below it, the pending reviewers' block, or the muted note.
 * `onRow` hears of each row's drawn header, which is where the panel's
 * cursor lands and what it scrolls into view.
 */
export function PRInfoConversationView(props: {
  model: ConversationRows
  markdown: ConversationMarkdown
  onRow?: OnRow
}) {
  return (
    <>
      <For each={props.model.rows}>
        {(row) => (
          <Switch>
            <Match when={row.kind === "item" && row}>
              {(item: () => Item) => <ItemRow row={item()} markdown={props.markdown} onRow={props.onRow} />}
            </Match>
            <Match when={row.kind === "reviewers" && row}>
              {(block: () => Reviewers) => <ReviewersBlock row={block()} onRow={props.onRow} />}
            </Match>
          </Switch>
        )}
      </For>
      <Show when={props.model.note}>{(note: () => string) => <text fg={theme.overlay0}>{note()}</text>}</Show>
    </>
  )
}

function ItemRow(props: { row: Item; markdown: ConversationMarkdown; onRow: OnRow }) {
  return (
    <>
      <box
        ref={(header) => props.onRow?.(props.row.key, header)}
        flexDirection="row"
        height={1}
        overflow="hidden"
        paddingLeft={props.row.indent}
        backgroundColor={props.row.selected ? theme.surface0 : undefined}
      >
        <Label label={props.row.label} />
        <For each={props.row.header}>{(segment) => <Cell segment={segment} />}</For>
      </box>
      <For each={props.row.body}>{(part) => <BodyPartView part={part} markdown={props.markdown} />}</For>
    </>
  )
}

/** The block's own background marks it selected, so its names sit on surface0 too. */
function ReviewersBlock(props: { row: Reviewers; onRow: OnRow }) {
  return (
    <box
      ref={(block) => props.onRow?.(props.row.key, block)}
      flexDirection="column"
      marginTop={1}
      backgroundColor={props.row.selected ? theme.surface0 : undefined}
    >
      <box flexDirection="row" height={1}>
        <Label label={props.row.label} />
        <For each={props.row.header}>{(segment) => <Cell segment={segment} />}</For>
      </box>
      <For each={props.row.names}>
        {(name) => (
          <box flexDirection="row" height={1} paddingLeft={props.row.namesIndent}>
            <text fg={name.fg}>{name.text}</text>
          </box>
        )}
      </For>
    </box>
  )
}

function Label(props: { label: string | undefined }) {
  return <Show when={props.label}>{(label: () => string) => <text fg={colors.flashLabel}>{`${label()} `}</text>}</Show>
}

/** A fixed cell keeps its width, a growing one takes what is left and gives it back first. */
function Cell(props: { segment: HeaderSegment }) {
  return (
    <Switch fallback={<text fg={props.segment.fg}>{props.segment.text}</text>}>
      <Match when={props.segment.flex === "fixed"}>
        <text fg={props.segment.fg} flexShrink={0}>
          {props.segment.text}
        </text>
      </Match>
      <Match when={props.segment.flex === "grow"}>
        <text fg={props.segment.fg} flexGrow={1} flexShrink={1}>
          {props.segment.text}
        </text>
      </Match>
    </Switch>
  )
}

function BodyPartView(props: { part: BodyPart; markdown: ConversationMarkdown }) {
  return (
    <Switch>
      <Match when={props.part.kind === "hunk" && props.part}>
        {(part: () => Part<"hunk">) => <Hunk part={part()} />}
      </Match>
      <Match when={props.part.kind === "markdown" && props.part}>
        {(part: () => Part<"markdown">) => <MarkdownBody part={part()} markdown={props.markdown} />}
      </Match>
      <Match when={props.part.kind === "reactions" && props.part}>
        {(part: () => Part<"reactions">) => <Pills indent={part().indent} pills={part().pills} />}
      </Match>
      <Match when={props.part.kind === "reply" && props.part}>
        {(part: () => Part<"reply">) => <Reply part={part()} />}
      </Match>
    </Switch>
  )
}

function Hunk(props: { part: Part<"hunk"> }) {
  return (
    <box flexDirection="column" paddingLeft={props.part.indent} paddingRight={2} marginTop={1} backgroundColor={theme.mantle}>
      <For each={props.part.lines}>{(line) => <text fg={line.fg}>{line.text}</text>}</For>
    </box>
  )
}

/**
 * The model's text is the markdown as drawn. The pictures it carried are
 * named under it: the panel cannot draw them, and Enter opens the item on
 * github.com, where they can be looked at.
 *
 * The body is built here, with its style in its constructor, rather than as
 * a `<markdown>` element: Solid hands an element its props after it is
 * made, and in OpenTUI 0.6.0 a syntax style set after construction, on a
 * body with a renderNode, redraws its list items empty until the
 * highlighter answers — a frame or more of bullets with no words.
 */
function MarkdownBody(props: { part: Part<"markdown">; markdown: ConversationMarkdown }) {
  const body = new MarkdownRenderable(useRenderer(), {
    ...props.markdown,
    id: props.part.id,
    content: props.part.text,
    // Nothing streams here — but streaming is what makes OpenTUI lay the
    // text down from the markdown tokens up front instead of waiting on the
    // highlighter, so the first frame a body appears on is the frame it
    // reads on.
    streaming: true,
  })
  createEffect(() => {
    body.content = props.part.text
  })
  return (
    <box flexDirection="column" paddingLeft={props.part.indent} paddingRight={2} marginTop={1} marginBottom={1}>
      {body}
      <For each={props.part.images}>{(label) => <text fg={theme.sapphire}>{`▣ ${label}`}</text>}</For>
    </box>
  )
}

function Pills(props: { indent: number; pills: Segment[] }) {
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

function Reply(props: { part: Part<"reply"> }) {
  return (
    <box flexDirection="row" height={1} paddingLeft={props.part.indent}>
      <text fg={theme.surface2}>└ </text>
      <text fg={theme.sapphire} flexShrink={0}>{`@${props.part.author}`}</text>
      <text flexGrow={1} flexShrink={1}>{""}</text>
      <text fg={theme.overlay0} flexShrink={0}>
        {props.part.time}
      </text>
    </box>
  )
}
