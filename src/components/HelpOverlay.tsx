import { For, Show } from "solid-js"
import { theme, colors } from "../theme"
import { HELP_KEY_CELLS, helpColumns, type HelpSection } from "./help-sections"
import type { HelpOverlayModel } from "./help-overlay-model"

function Column(props: { sections: readonly HelpSection[] }) {
  return (
    <box flexDirection="column" flexGrow={1}>
      <For each={props.sections}>
        {(section) => (
          <box flexDirection="column" marginBottom={1}>
            <text fg={theme.lavender}>{section.title}</text>
            <For each={section.keys}>
              {([key, desc]) => (
                <box height={1} flexDirection="row">
                  <box width={HELP_KEY_CELLS}>
                    <text fg={theme.yellow}>{key}</text>
                  </box>
                  <text fg={colors.text}>{desc}</text>
                </box>
              )}
            </For>
          </box>
        )}
      </For>
    </box>
  )
}

/**
 * The keymap overlay behind `g?`. A cheat sheet, not an inventory — the action
 * menu (Ctrl+p) is the exhaustive, state-aware list.
 */
export function HelpOverlay(props: { model: HelpOverlayModel }) {
  const [left, right] = helpColumns()
  return (
    <box flexDirection="column" backgroundColor={theme.base} padding={2} minWidth={80} maxWidth={104}>
      <box height={1} marginBottom={1} flexDirection="row" justifyContent="space-between">
        <text fg={colors.primary}>Keyboard Shortcuts</text>
        <Show when={props.model.version !== undefined}>
          <text fg={theme.overlay0}>{`riff ${props.model.version}`}</text>
        </Show>
      </box>
      <box flexDirection="row" gap={4}>
        <Column sections={left} />
        <Column sections={right} />
      </box>
      <box height={1} marginTop={1}>
        <text fg={colors.textDim}>Press g? or Esc to close</text>
      </box>
    </box>
  )
}
