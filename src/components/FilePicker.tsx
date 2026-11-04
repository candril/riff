import { For, Show, type JSX } from "solid-js"
import { theme } from "../theme"
import { MatchedSpans } from "./MatchedSpans"
import { PickerFrame, rowBackground } from "./PickerFrame"
import type { FilePickerModel, FilePickerRow } from "./file-picker-model"

export type { FilteredFile } from "./file-picker-model"

function FileRow(props: { row: FilePickerRow }) {
  return (
    <box flexDirection="row" justifyContent="space-between" backgroundColor={rowBackground(props.row.selected)} paddingX={2} width="100%">
      <box flexDirection="row" flexGrow={1}>
        <Show when={props.row.viewed}>
          <text fg={theme.green}>{"✓ "}</text>
        </Show>
        <text fg={props.row.nameFg}>
          <MatchedSpans spans={props.row.nameSpans} fg={props.row.nameFg} />
        </text>
      </box>
      <box flexDirection="row">
        <Show when={props.row.comments}>{(comments: () => string) => <text fg={theme.blue}>{`${comments()} `}</text>}</Show>
        <text fg={theme.overlay0}>{props.row.stats}</text>
      </box>
    </box>
  )
}

/** Ctrl+f: fuzzy search over the diff's files. */
export function FilePicker(props: { model: FilePickerModel; field: JSX.Element }) {
  return (
    <PickerFrame model={props.model} field={props.field} width="50%" left="25%">
      <For each={props.model.rows}>{(row) => <FileRow row={row} />}</For>
    </PickerFrame>
  )
}
