import { For, Show, type JSX } from "solid-js"
import { theme } from "../theme"
import { PickerFrame, rowBackground } from "./PickerFrame"
import type { CommentsPickerModel, CommentsPickerRow } from "./comments-picker-model"

function CommentRow(props: { row: CommentsPickerRow }) {
  return (
    <box flexDirection="row" backgroundColor={rowBackground(props.row.selected)} paddingX={2} width="100%">
      <box flexDirection="row" width={2}>
        <text fg={props.row.glyphFg}>{props.row.glyph}</text>
      </box>
      <box flexDirection="row" flexShrink={0}>
        <text fg={props.row.locationFg}>{` ${props.row.location} `}</text>
      </box>
      <box flexDirection="row" flexGrow={1}>
        <text fg={props.row.previewFg}>{props.row.preview}</text>
      </box>
      <Show when={props.row.author}>
        {(author: () => string) => (
          <box flexDirection="row">
            <text fg={theme.overlay0}>{` ${author()}`}</text>
          </box>
        )}
      </Show>
    </box>
  )
}

/** gC (spec 044): fuzzy search over every comment in the diff. */
export function CommentsPicker(props: { model: CommentsPickerModel; field: JSX.Element }) {
  return (
    <PickerFrame model={props.model} field={props.field} width="70%" left="15%">
      <For each={props.model.rows}>{(row) => <CommentRow row={row} />}</For>
    </PickerFrame>
  )
}
