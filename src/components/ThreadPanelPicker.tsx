import { For, Match, Switch } from "solid-js"
import { theme } from "../theme"
import { AtPickerView, PickerFooter, PickerRow } from "./AtPickerView"
import type { ThreadPanelPicker } from "./thread-panel-model"

export type Picker = NonNullable<ThreadPanelPicker>
type PickerOf<K extends Picker["kind"]> = Extract<Picker, { kind: K }>

/** The composer's open `@mention`, `:emoji` or code span session, as the list it is choosing from. */
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
      <Match when={props.picker.kind === "mention" && props.picker}>
        {(picker: () => PickerOf<"mention">) => <AtPickerView picker={picker().picker} />}
      </Match>
      <Match when={props.picker.kind === "symbol" && props.picker}>
        {(picker: () => PickerOf<"symbol">) => <AtPickerView picker={picker().picker} />}
      </Match>
    </Switch>
  )
}
