import { For, Show, type JSX } from "solid-js"
import type { InputRenderable } from "@opentui/core"
import { theme } from "../theme"
import type { PickerModel, PickerRow } from "./picker-window"

type FrameModel = Pick<PickerModel<PickerRow>, "title" | "hints" | "above" | "below" | "empty"> & {
  /** Null when the picker places its count among its hints. */
  count: string | null
  /** Drawn in yellow beside the title. */
  badge?: string | null
}

export interface PickerFrameProps {
  model: FrameModel
  /** PromptInput's field for this picker, which outlives every time it opens. */
  field: InputRenderable
  fieldPrefix?: string
  /** Shown in the field row in place of the prefix and the field, which then stay mounted but hidden. */
  fieldText?: { text: string; fg: string } | null
  /** Keys under the list, one entry per line. */
  footer?: readonly string[]
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
          <box flexDirection="row" gap={2}>
            <text fg={theme.subtext0}>{props.model.title}</text>
            <Show when={props.model.badge}>{(badge: () => string) => <text fg={theme.yellow}>{badge()}</text>}</Show>
          </box>
          <box flexDirection="row" gap={2}>
            <Show when={props.model.count !== null}>
              <text fg={theme.overlay0}>{props.model.count}</text>
            </Show>
            <For each={props.model.hints}>{(hint) => <text fg={theme.overlay0}>{hint}</text>}</For>
          </box>
        </box>
        {/* One row, always: the shared input has no height of its own, and a
            box that has to measure it can come out wrong when the field has
            just moved here from another prompt. */}
        <box flexDirection="row" paddingX={2} paddingBottom={1} height={1} backgroundColor={theme.surface0}>
          <box flexDirection="row" flexGrow={1} visible={!props.fieldText}>
            <Show when={props.fieldPrefix}>{(prefix: () => string) => <text fg={theme.subtext0}>{prefix()}</text>}</Show>
            {props.field}
          </box>
          <Show when={props.fieldText}>
            {(fieldText: () => { text: string; fg: string }) => <text fg={fieldText().fg}>{fieldText().text}</text>}
          </Show>
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
        <Show when={props.footer}>
          {(footer: () => readonly string[]) => (
            <box flexDirection="column" paddingX={2} paddingTop={1}>
              <For each={footer()}>{(line) => <text fg={theme.overlay0} height={1}>{line}</text>}</For>
            </box>
          )}
        </Show>
      </box>
    </>
  )
}

/** A row's shade: surface0 marks the selection on the picker's mantle. */
export const rowBackground = (selected: boolean) => (selected ? theme.surface0 : undefined)
