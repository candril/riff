import { For, Match, Show, Switch, type JSX } from "solid-js"
import { theme } from "../theme"
import { PickerFrame, rowBackground } from "./PickerFrame"
import type { AllCommitsRow, CommitPickerModel, CommitPickerRow, CommitRow } from "./commit-picker-model"

export type { FilteredCommit } from "./commit-picker-model"

function AllRow(props: { row: AllCommitsRow }) {
  return (
    <box
      flexDirection="row"
      justifyContent="space-between"
      backgroundColor={rowBackground(props.row.selected)}
      paddingX={2}
      width="100%"
      height={1}
      overflow="hidden"
    >
      <box flexDirection="row">
        <text fg={theme.green} flexShrink={0}>{props.row.active ? "● " : "  "}</text>
        <text fg={props.row.labelFg}>All commits</text>
      </box>
      <text fg={theme.overlay0}>{props.row.total}</text>
    </box>
  )
}

/**
 * One row, one line. Without a fixed height a long subject wraps and the
 * column then compresses the rows into each other — two commits drawn on
 * the same screen line, letter by letter.
 *
 * A marked row is told apart by its peach text alone: a shade of its own
 * would read as the selection, which is the only row a list shades.
 */
function ShaRow(props: { row: CommitRow }) {
  return (
    <box
      flexDirection="row"
      justifyContent="space-between"
      backgroundColor={rowBackground(props.row.selected)}
      paddingX={2}
      width="100%"
      height={1}
      overflow="hidden"
    >
      <box flexDirection="row" flexShrink={1} overflow="hidden">
        {/* Only the subject gives way: were the dot, the sha or the gap after
            it allowed to shrink, they collapse first and the sha runs into the subject. */}
        <text fg={theme.green} flexShrink={0}>{props.row.active ? "● " : "  "}</text>
        <text fg={props.row.shaFg} flexShrink={0}>{props.row.sha}</text>
        <text fg={theme.overlay0} flexShrink={0}>{"  "}</text>
        <text fg={props.row.messageFg} flexShrink={1}>{props.row.message}</text>
      </box>
      {/* paddingLeft keeps a gap when the subject is long enough to shrink
          into it — without one the message runs straight into the author. */}
      <box flexDirection="row" flexShrink={0} paddingLeft={2}>
        <Show when={props.row.note}>{(note: () => string) => <text fg={theme.overlay0}>{`${note()}  `}</text>}</Show>
        <text fg={theme.overlay0}>{props.row.author}</text>
        <text fg={theme.overlay0}>{`  ${props.row.time}`}</text>
      </box>
    </box>
  )
}

function Row(props: { row: CommitPickerRow }) {
  return (
    <Switch>
      <Match when={props.row.kind === "all" && props.row}>{(row: () => AllCommitsRow) => <AllRow row={row()} />}</Match>
      <Match when={props.row.kind === "commit" && props.row}>{(row: () => CommitRow) => <ShaRow row={row()} />}</Match>
    </Switch>
  )
}

/** Ctrl-g (spec 078): scope the diff to one commit, or to the ones marked. */
export function CommitPicker(props: { model: CommitPickerModel; field: JSX.Element }) {
  return (
    <PickerFrame
      model={props.model}
      field={props.field}
      fieldPrefix="/"
      fieldText={props.model.filtering ? null : { text: props.model.fieldText, fg: props.model.fieldFg }}
      footer={props.model.keys}
      width="60%"
      left="20%"
    >
      <For each={props.model.rows}>{(row) => <Row row={row} />}</For>
    </PickerFrame>
  )
}
