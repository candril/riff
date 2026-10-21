import { For, Match, Switch, type JSX } from "solid-js"
import { theme } from "../theme"
import { PickerFrame, rowBackground } from "./PickerFrame"
import type { Segment } from "./occurrence-excerpt"
import type {
  OccurrenceFileRow,
  OccurrenceHitRow,
  OccurrencePickerModel,
  OccurrencePickerRow,
} from "./occurrence-picker-model"

function Segments(props: { segments: Segment[]; fg: string }) {
  return (
    <For each={props.segments}>
      {(seg) => (
        <Switch fallback={<text fg={props.fg}>{seg.text}</text>}>
          <Match when={seg.mark === "match"}>
            <text fg={theme.crust} bg={theme.yellow}>
              {seg.text}
            </text>
          </Match>
          <Match when={seg.mark === "narrow"}>
            <text fg={theme.crust} bg={theme.teal}>
              {seg.text}
            </text>
          </Match>
        </Switch>
      )}
    </For>
  )
}

function FileRow(props: { row: OccurrenceFileRow }) {
  return (
    <box flexDirection="row" justifyContent="space-between" paddingX={2} width="100%" height={1} overflow="hidden">
      <box flexDirection="row">
        <Segments segments={props.row.name} fg={theme.blue} />
      </box>
      <text fg={theme.overlay0}>{props.row.count}</text>
    </box>
  )
}

function HitRow(props: { row: OccurrenceHitRow }) {
  return (
    <box
      flexDirection="row"
      backgroundColor={rowBackground(props.row.selected)}
      paddingX={2}
      width="100%"
      height={1}
      overflow="hidden"
    >
      <text fg={theme.overlay0}>{props.row.lineNum}</text>
      <text fg={props.row.markerFg}>{` ${props.row.marker} `}</text>
      <Segments segments={props.row.excerpt} fg={props.row.textFg} />
    </box>
  )
}

function OccurrenceRow(props: { row: OccurrencePickerRow }) {
  return (
    <Switch>
      <Match when={props.row.kind === "file" && props.row}>{(row: () => OccurrenceFileRow) => <FileRow row={row()} />}</Match>
      <Match when={props.row.kind === "hit" && props.row}>{(row: () => OccurrenceHitRow) => <HitRow row={row()} />}</Match>
    </Switch>
  )
}

/** Ctrl-s (spec 088): every row of the diff the query hits, under a header per file. */
export function OccurrencePicker(props: { model: OccurrencePickerModel; field: JSX.Element }) {
  return (
    <PickerFrame model={props.model} field={props.field} width="80%" left="10%">
      <For each={props.model.rows}>{(row) => <OccurrenceRow row={row} />}</For>
    </PickerFrame>
  )
}
