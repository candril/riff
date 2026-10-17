import { For, Show } from "solid-js"
import type { InputRenderable } from "@opentui/core"
import { theme } from "../theme"
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
        <text fg={props.row.nameFg}>{props.row.name}</text>
      </box>
      <box flexDirection="row">
        <Show when={props.row.comments}>{(comments: () => string) => <text fg={theme.blue}>{`${comments()} `}</text>}</Show>
        <text fg={theme.overlay0}>{props.row.stats}</text>
      </box>
    </box>
  )
}

/** Ctrl+f: fuzzy search over the diff's files. */
export function FilePicker(props: { model: FilePickerModel; field: InputRenderable }) {
  return (
    <PickerFrame model={props.model} field={props.field} width="50%" left="25%">
      <For each={props.model.rows}>{(row) => <FileRow row={row} />}</For>
    </PickerFrame>
  )
}
