import { For, Show } from "solid-js"
import { colors, theme } from "../theme"
import type { ListRows } from "./pr-info-list-rows"

/**
 * One list section of the PR info panel: a row per item, then the muted
 * note. The boxes and texts carry no flex settings of their own, as the
 * imperative rows did not, so a message too wide for its row still
 * squeezes the columns before it.
 */
export function PRInfoListView(props: { model: ListRows }) {
  return (
    <>
      <For each={props.model.rows}>
        {(row) => (
          <box flexDirection="row" height={1} backgroundColor={row.selected ? theme.surface0 : undefined}>
            <Show when={row.label}>{(label: () => string) => <text fg={colors.flashLabel}>{`${label()} `}</text>}</Show>
            <For each={row.segments}>{(segment) => <text fg={segment.fg}>{segment.text}</text>}</For>
          </box>
        )}
      </For>
      <Show when={props.model.note}>{(note: () => string) => <text fg={theme.overlay0}>{note()}</text>}</Show>
    </>
  )
}
