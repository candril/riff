import { For, type JSX } from "solid-js"
import { PickerFrame, rowBackground } from "./PickerFrame"
import type { MarksPickerModel, MarksPickerRow } from "./marks-picker-model"

function MarkRow(props: { row: MarksPickerRow }) {
  return (
    <box flexDirection="row" backgroundColor={rowBackground(props.row.selected)} paddingX={2} width="100%">
      <box flexDirection="row" width={2}>
        <text fg={props.row.letterFg}>{props.row.letter}</text>
      </box>
      <box flexDirection="row" flexShrink={0}>
        <text fg={props.row.locationFg}>{` ${props.row.location} `}</text>
      </box>
      <box flexDirection="row" flexGrow={1}>
        <text fg={props.row.textFg}>{props.row.text}</text>
      </box>
    </box>
  )
}

/** Ctrl-k: every global mark (spec 101), laid out as the comments picker is. */
export function MarksPicker(props: { model: MarksPickerModel; field: JSX.Element }) {
  return (
    <PickerFrame model={props.model} field={props.field} width="70%" left="15%">
      <For each={props.model.rows}>{(row) => <MarkRow row={row} />}</For>
    </PickerFrame>
  )
}
