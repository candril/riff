import { For, Show, type JSX } from "solid-js"
import { theme } from "../theme"
import { MatchedSpans } from "./MatchedSpans"
import { PickerFrame, rowBackground } from "./PickerFrame"
import type { CommentsPickerModel, CommentsPickerRow } from "./comments-picker-model"

function CommentRow(props: { row: CommentsPickerRow }) {
  return (
    <box flexDirection="row" backgroundColor={rowBackground(props.row.selected)} paddingX={2} width="100%">
      <box flexDirection="row" width={2}>
        <text fg={props.row.glyphFg}>{props.row.glyph}</text>
      </box>
      <box flexDirection="row" flexShrink={0}>
        <text fg={props.row.locationFg}>
          <span>{" "}</span>
          <MatchedSpans spans={props.row.locationSpans} fg={props.row.locationFg} />
          <span>{" "}</span>
        </text>
      </box>
      <box flexDirection="row" flexGrow={1}>
        <text fg={props.row.previewFg}>
          <MatchedSpans spans={props.row.previewSpans} fg={props.row.previewFg} />
        </text>
      </box>
      <Show when={props.row.author}>
        <box flexDirection="row">
          <text fg={theme.overlay0}>
            <span>{" "}</span>
            <MatchedSpans spans={props.row.authorSpans} fg={theme.overlay0} />
          </text>
        </box>
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
