import { For, Show, type JSX } from "solid-js"
import type { InputRenderable } from "@opentui/core"
import { theme } from "../theme"
import type { PickerModel, PickerRow } from "./picker-window"

export interface PickerFrameProps {
  model: Pick<PickerModel<PickerRow>, "title" | "count" | "hints" | "above" | "below" | "empty">
  /** PromptInput's field for this picker, which outlives every time it opens. */
  field: InputRenderable
  width: `${number}%`
  left: `${number}%`
  children: JSX.Element
}

function Note(props: { text: string }) {
  return (
    <box paddingX={2} height={1}>
      <text fg={theme.overlay0}>{props.text}</text>
    </box>
  )
}

/**
 * The panel the fuzzy pickers share over a dimmed screen: a title with the
 * count and the keys, the field typed into, and the rows in view between
 * notes of how many lie beyond them.
 */
export function PickerFrame(props: PickerFrameProps) {
  return (
    <>
      <box position="absolute" top={0} left={0} width="100%" height="100%" backgroundColor="#00000080" />
      <box
        position="absolute"
        top={2}
        left={props.left}
        width={props.width}
        flexDirection="column"
        backgroundColor={theme.mantle}
      >
        <box flexDirection="row" justifyContent="space-between" paddingX={2} paddingY={1}>
          <text fg={theme.subtext0}>{props.model.title}</text>
          <box flexDirection="row" gap={2}>
            <text fg={theme.overlay0}>{props.model.count}</text>
            <For each={props.model.hints}>{(hint) => <text fg={theme.overlay0}>{hint}</text>}</For>
          </box>
        </box>
        {/* One row, always: the shared input has no height of its own, and a
            box that has to measure it can come out wrong when the field has
            just moved here from another prompt. */}
        <box flexDirection="row" paddingX={2} paddingBottom={1} height={1} backgroundColor={theme.surface0}>
          {props.field}
        </box>
        <box flexDirection="column" paddingBottom={1}>
          <Show when={props.model.above > 0}>
            <Note text={`↑ ${props.model.above} more`} />
          </Show>
          {props.children}
          <Show when={props.model.below > 0}>
            <Note text={`↓ ${props.model.below} more`} />
          </Show>
          <Show when={props.model.empty}>{(empty: () => string) => <Note text={empty()} />}</Show>
        </box>
      </box>
    </>
  )
}

/** A row's shade: surface0 marks the selection on the picker's mantle. */
export const rowBackground = (selected: boolean) => (selected ? theme.surface0 : undefined)
