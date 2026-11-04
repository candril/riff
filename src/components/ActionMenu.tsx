import { For, Match, Show, Switch, type JSX } from "solid-js"
import { theme } from "../theme"
import { MatchedSpans } from "./MatchedSpans"
import { PickerFrame, rowBackground } from "./PickerFrame"
import type { ActionMenuModel, ActionMenuRow } from "./action-menu-model"

type Of<Kind extends ActionMenuRow["kind"]> = Extract<ActionMenuRow, { kind: Kind }>

function ActionRow(props: { row: Of<"action"> }) {
  return (
    <box flexDirection="row" justifyContent="space-between" backgroundColor={rowBackground(props.row.selected)} paddingX={2} width="100%">
      <text fg={props.row.labelFg}>
        <MatchedSpans spans={props.row.labelSpans} fg={props.row.labelFg} />
      </text>
      <Show when={props.row.shortcut}>{(shortcut: () => string) => <text fg={theme.overlay0}>{shortcut()}</text>}</Show>
    </box>
  )
}

/**
 * One line per row: the label is what the reader is choosing between, so it
 * stays whole and a long trailing note is clipped instead of wrapping the
 * row into two.
 */
function SubmenuRowView(props: { row: Of<"submenu"> }) {
  return (
    <box
      flexDirection="row"
      justifyContent="space-between"
      backgroundColor={rowBackground(props.row.selected)}
      paddingX={2}
      width="100%"
      height={1}
      overflow="hidden"
    >
      <box flexShrink={0}>
        <text fg={props.row.labelFg}>
          <MatchedSpans spans={props.row.labelSpans} fg={props.row.labelFg} />
        </text>
      </box>
      <Show when={props.row.trailing}>
        <box flexShrink={1} overflow="hidden" paddingLeft={2}>
          <text fg={props.row.trailingFg}>
            <MatchedSpans spans={props.row.trailingSpans} fg={props.row.trailingFg} />
          </text>
        </box>
      </Show>
    </box>
  )
}

/**
 * The command palette, and the submenus (spec 042) that take its list's
 * place while it stays open.
 */
export function ActionMenu(props: { model: ActionMenuModel; field: JSX.Element }) {
  const frame = {
    get title() {
      return props.model.title
    },
    count: null,
    get hints() {
      return [props.model.hint]
    },
    get above() {
      return props.model.above
    },
    get below() {
      return props.model.below
    },
    empty: null,
  }
  return (
    <PickerFrame model={frame} field={props.field} width="50%" left="25%">
      <For each={props.model.rows}>
        {(row) => (
          <Switch>
            <Match when={row.kind === "category" && row}>
              {(category: () => Of<"category">) => (
                <box paddingX={2} paddingTop={1}>
                  <text fg={theme.lavender}>{category().label}</text>
                </box>
              )}
            </Match>
            <Match when={row.kind === "action" && row}>{(action: () => Of<"action">) => <ActionRow row={action()} />}</Match>
            <Match when={row.kind === "submenu" && row}>
              {(submenu: () => Of<"submenu">) => <SubmenuRowView row={submenu()} />}
            </Match>
          </Switch>
        )}
      </For>
    </PickerFrame>
  )
}
