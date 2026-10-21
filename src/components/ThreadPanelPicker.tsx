import { For, Match, Switch, type JSX } from "solid-js"
import { theme } from "../theme"
import type { ThreadPanelPicker } from "./thread-panel-model"

export type Picker = NonNullable<ThreadPanelPicker>
type PickerOf<K extends Picker["kind"]> = Extract<Picker, { kind: K }>

/** The composer's open `@mention` or `:emoji` session, as the list it is choosing from. */
export function ThreadPanelPickerView(props: { picker: Picker }) {
  return (
    <Switch>
      <Match when={props.picker.kind === "emoji-empty" && props.picker}>
        {(picker: () => PickerOf<"emoji-empty">) => (
          <box flexDirection="column" marginTop={1} paddingX={1} backgroundColor={theme.mantle}>
            <text fg={theme.overlay0}>{picker().text}</text>
          </box>
        )}
      </Match>
      <Match when={props.picker.kind === "emoji" && props.picker}>
        {(picker: () => PickerOf<"emoji">) => (
          <box flexDirection="column" paddingX={1} backgroundColor={theme.mantle}>
            <box flexDirection="row" height={1}>
              <text fg={theme.yellow}>:emoji</text>
            </box>
            <For each={picker().rows}>
              {(emoji, i) => (
                <PickerRow selected={i() === picker().selected} accent={theme.yellow}>
                  <text fg={theme.text}>{`${emoji.char}  `}</text>
                  <text fg={theme.subtext0}>{`:${emoji.name}:`}</text>
                </PickerRow>
              )}
            </For>
            <PickerFooter />
          </box>
        )}
      </Match>
      <Match when={props.picker.kind === "mention-empty" && props.picker}>
        {(picker: () => PickerOf<"mention-empty">) => (
          <box flexDirection="column" marginTop={1} paddingX={1} paddingY={0} backgroundColor={theme.mantle}>
            <text fg={theme.overlay0}>{picker().text}</text>
          </box>
        )}
      </Match>
      <Match when={props.picker.kind === "mention" && props.picker}>
        {(picker: () => PickerOf<"mention">) => (
          <box flexDirection="column" marginTop={1} paddingX={1} paddingY={0} backgroundColor={theme.mantle}>
            <box flexDirection="row" height={1}>
              <text fg={theme.blue}>@mention</text>
            </box>
            <For each={picker().rows}>
              {(name, i) => (
                <PickerRow selected={i() === picker().selected} accent={theme.blue}>
                  <text fg={theme.text}>{name}</text>
                </PickerRow>
              )}
            </For>
            <PickerFooter />
          </box>
        )}
      </Match>
    </Switch>
  )
}

function PickerRow(props: { selected: boolean; accent: string; children: JSX.Element }) {
  return (
    <box flexDirection="row" height={1} backgroundColor={props.selected ? theme.surface0 : undefined}>
      <text fg={props.selected ? props.accent : theme.overlay0}>{props.selected ? "▸ " : "  "}</text>
      {props.children}
    </box>
  )
}

function PickerFooter() {
  return (
    <box flexDirection="row" height={1}>
      <text fg={theme.overlay0}>{"↑↓ nav  "}</text>
      <text fg={theme.overlay0}>{"Tab/⏎ accept  "}</text>
      <text fg={theme.overlay0}>Esc dismiss</text>
    </box>
  )
}
