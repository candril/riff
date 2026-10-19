import { For, Show } from "solid-js"
import { colors, theme } from "../theme"
import type { ListRow, ListRows, ListSegment } from "./pr-info-list-rows"

/**
 * One list section of the PR info panel: a row per item, then the muted
 * note. The boxes and texts carry no flex settings of their own, so a
 * message too wide for its row squeezes the columns before it.
 */
export function PRInfoListView(props: { model: ListRows }) {
  return (
    <>
      <For each={props.model.rows}>
        {(row) => (
          <Show
            when={row.below}
            fallback={
              <box flexDirection="row" height={1} backgroundColor={row.selected ? theme.surface0 : undefined}>
                <Line row={row} />
              </box>
            }
          >
            {(below: () => ListSegment[]) => (
              <box flexDirection="column" backgroundColor={row.selected ? theme.surface0 : undefined}>
                <box flexDirection="row" height={1}>
                  <Line row={row} />
                </box>
                <box flexDirection="row" height={1}>
                  <Segments segments={below()} />
                </box>
              </box>
            )}
          </Show>
        )}
      </For>
      <Show when={props.model.note}>{(note: () => string) => <text fg={theme.overlay0}>{note()}</text>}</Show>
    </>
  )
}

function Line(props: { row: ListRow }) {
  return (
    <>
      <Show when={props.row.label}>{(label: () => string) => <text fg={colors.flashLabel}>{`${label()} `}</text>}</Show>
      <Segments segments={props.row.segments} />
    </>
  )
}

function Segments(props: { segments: ListSegment[] }) {
  return <For each={props.segments}>{(segment) => <text fg={segment.fg}>{segment.text}</text>}</For>
}
