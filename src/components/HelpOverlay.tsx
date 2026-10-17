import { For, Match, Show, Switch } from "solid-js"
import { theme, colors } from "../theme"
import { HELP_COLUMN_ROWS, HELP_KEY_CELLS, helpColumnCells, type HelpRow } from "./help-sections"
import type { HelpOverlayModel } from "./help-overlay-model"

function Row(props: { row: HelpRow }) {
  return (
    <box height={1} flexDirection="row">
      <Switch>
        <Match when={props.row.kind === "title" && props.row}>
          {(row: () => Extract<HelpRow, { kind: "title" }>) => <text fg={theme.lavender}>{row().text}</text>}
        </Match>
        <Match when={props.row.kind === "key" && props.row}>
          {(row: () => Extract<HelpRow, { kind: "key" }>) => (
            <>
              <box width={HELP_KEY_CELLS}>
                <text fg={theme.yellow}>{row().key}</text>
              </box>
              <text fg={colors.text}>{row().desc}</text>
            </>
          )}
        </Match>
      </Switch>
    </box>
  )
}

const [LEFT_CELLS, RIGHT_CELLS] = HELP_COLUMN_ROWS.map(helpColumnCells)

function Column(props: { rows: readonly HelpRow[]; cells: number }) {
  return (
    <box flexDirection="column" flexGrow={1} flexBasis={props.cells}>
      <For each={props.rows}>{(row) => <Row row={row} />}</For>
    </box>
  )
}

function moreMarker(more: HelpOverlayModel["more"]): string {
  return [more.above && "↑ more", more.below && "↓ more"].filter(Boolean).join(" · ")
}

/**
 * The keymap overlay behind `g?`. A cheat sheet, not an inventory — the action
 * menu (Ctrl+p) is the exhaustive, state-aware list.
 */
export function HelpOverlay(props: { model: HelpOverlayModel }) {
  const scrolls = () => props.model.more.above || props.model.more.below
  return (
    <box flexDirection="column" backgroundColor={theme.base} padding={2} minWidth={80} maxWidth={104}>
      <box height={1} marginBottom={1} flexDirection="row" justifyContent="space-between">
        <text fg={colors.primary}>Keyboard Shortcuts</text>
        <Show when={props.model.version !== undefined}>
          <text fg={theme.overlay0}>{`riff ${props.model.version}`}</text>
        </Show>
      </box>
      <box flexDirection="row" gap={4}>
        <Column rows={props.model.left} cells={LEFT_CELLS!} />
        <Column rows={props.model.right} cells={RIGHT_CELLS!} />
      </box>
      <box height={1} marginTop={1} flexDirection="row" justifyContent="space-between">
        <text fg={colors.textDim}>{scrolls() ? "j / k scroll · g? or Esc to close" : "Press g? or Esc to close"}</text>
        <Show when={scrolls()}>
          <text fg={colors.textDim}>{moreMarker(props.model.more)}</text>
        </Show>
      </box>
    </box>
  )
}
