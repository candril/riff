import { For, Match, Show, Switch, type JSX } from "solid-js"
import { theme } from "../theme"
import type { AtPicker } from "./at-picker"

type AtPickerOf<K extends AtPicker["kind"]> = Extract<AtPicker, { kind: K }>

/** An input's open `@` session, as the list it is choosing from (specs 082, 102). */
export function AtPickerView(props: { picker: AtPicker }) {
  return (
    <Switch>
      <Match when={props.picker.kind === "empty" && props.picker}>
        {(picker: () => AtPickerOf<"empty">) => (
          <box flexDirection="column" marginTop={1} paddingX={1} paddingY={0} backgroundColor={theme.mantle}>
            <text fg={theme.overlay0}>{picker().text}</text>
          </box>
        )}
      </Match>
      <Match when={props.picker.kind === "rows" && props.picker}>
        {(picker: () => AtPickerOf<"rows">) => (
          <box flexDirection="column" marginTop={1} paddingX={1} paddingY={0} backgroundColor={theme.mantle}>
            <box flexDirection="row" height={1}>
              <text fg={picker().accent}>{picker().title}</text>
            </box>
            <For each={picker().rows}>
              {(row, i) => (
                <PickerRow selected={i() === picker().selected} accent={picker().accent}>
                  <text fg={row.fg ?? theme.text}>{row.text}</text>
                  <Show when={row.detail}>
                    {(detail: () => string) => (
                      <>
                        <box flexGrow={1} />
                        <text fg={theme.overlay0} flexShrink={0}>{`  ${detail()}`}</text>
                      </>
                    )}
                  </Show>
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

export function PickerRow(props: { selected: boolean; accent: string; children: JSX.Element }) {
  return (
    <box flexDirection="row" height={1} backgroundColor={props.selected ? theme.surface0 : undefined}>
      <text fg={props.selected ? props.accent : theme.overlay0}>{props.selected ? "▸ " : "  "}</text>
      {props.children}
    </box>
  )
}

export function PickerFooter() {
  return (
    <box flexDirection="row" height={1}>
      <text fg={theme.overlay0}>{"↑↓ nav  "}</text>
      <text fg={theme.overlay0}>{"Tab/⏎ accept  "}</text>
      <text fg={theme.overlay0}>Esc dismiss</text>
    </box>
  )
}
