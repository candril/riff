import { For, Match, Switch } from "solid-js"
import { useRenderer } from "@opentui/solid"
import { colors, theme } from "../theme"
import { getSyntaxStyle } from "../vim-diff/syntax-style"
import type { PeekModel, PeekTone } from "./peek-model"

const TONE: Record<PeekTone, string> = {
  primary: colors.primary,
  dim: colors.textDim,
  text: colors.text,
  green: theme.green,
  red: theme.red,
  blue: theme.blue,
  peach: theme.peach,
  yellow: theme.yellow,
}

type CodeBody = Extract<PeekModel["body"], { kind: "code" }>
type RowsBody = Extract<PeekModel["body"], { kind: "rows" }>
type LinesBody = Extract<PeekModel["body"], { kind: "lines" }>

/** A peek's box, from its model; its island lays the dimmed screen under it. */
export function Peek(props: { model: PeekModel }) {
  const renderer = useRenderer()
  return (
    <box
      id={props.model.id}
      flexDirection="column"
      backgroundColor={props.model.background === "mantle" ? theme.mantle : theme.base}
      paddingTop={1}
      paddingBottom={1}
      paddingLeft={2}
      paddingRight={2}
      width={props.model.width}
    >
      <box height={1} marginBottom={1} flexDirection="row" gap={1}>
        <For each={props.model.header}>{(segment) => <text fg={TONE[segment.tone]}>{segment.text}</text>}</For>
      </box>
      <Switch>
        <Match when={props.model.body.kind === "code" && (props.model.body as CodeBody)}>
          {(body: () => CodeBody) => (
            // Highlighted rather than plain, because the point of reading the
            // line here is to read it as code. Wrapped on words — most long
            // lines worth peeking at are prose, and a token with no break in it
            // still gets broken at the edge.
            <code
              id="line-peek-code"
              content={body().content}
              filetype={body().filetype}
              syntaxStyle={getSyntaxStyle(renderer.nativeScene)}
              drawUnstyledText
              conceal={false}
              wrapMode="word"
              width={body().width}
            />
          )}
        </Match>
        <Match when={props.model.body.kind === "rows" && (props.model.body as RowsBody)}>
          {(body: () => RowsBody) => (
            // Pre-rendered, so each row is one text of its own: an absolutely
            // positioned box sizes itself as if every child were a single row.
            <For each={body().rows}>
              {(row) => (
                <box height={1}>
                  <text fg={TONE[row.tone]}>{row.text}</text>
                </box>
              )}
            </For>
          )}
        </Match>
        <Match when={props.model.body.kind === "lines" && (props.model.body as LinesBody)}>
          {(body: () => LinesBody) => (
            <For each={body().lines}>
              {(line) => (
                <box height={1} flexDirection="row" gap={1}>
                  <For each={line}>{(segment) => <text fg={TONE[segment.tone]}>{segment.text}</text>}</For>
                </box>
              )}
            </For>
          )}
        </Match>
      </Switch>
      <box height={1} marginTop={1}>
        <text fg={colors.textDim}>{props.model.footer}</text>
      </box>
    </box>
  )
}
