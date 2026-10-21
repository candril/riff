import { For, Match, Show, Switch } from "solid-js"
import { theme } from "../theme"
import type { SyncCard, SyncLine, SyncLineTone, SyncPreviewModel, SyncStatus } from "./sync-preview-model"

const TONE: Record<SyncLineTone, string> = {
  added: theme.green,
  removed: theme.red,
  plain: theme.text,
}

function Line(props: { line: SyncLine }) {
  return (
    <Show when={props.line.sign} fallback={<text fg={TONE[props.line.tone]}>{props.line.text}</text>}>
      <box flexDirection="row" gap={1}>
        <text fg={TONE[props.line.tone]}>{props.line.sign}</text>
        <text fg={TONE[props.line.tone]}>{props.line.text}</text>
      </box>
    </Show>
  )
}

function Card(props: { card: SyncCard }) {
  return (
    <box flexDirection="column" backgroundColor={theme.surface0} paddingX={1} paddingY={1}>
      <Show when={props.card.replyTo} fallback={<text fg={theme.blue}>{props.card.location}</text>}>
        <box flexDirection="row" gap={1}>
          <text fg={theme.blue}>{props.card.location}</text>
          <text fg={theme.overlay0}>→</text>
          <text fg={theme.lavender}>{`@${props.card.replyTo}`}</text>
        </box>
      </Show>
      <For each={props.card.lines}>{(line) => <Line line={line} />}</For>
    </box>
  )
}

function Status(props: { status: SyncStatus }) {
  return (
    <Switch fallback={<text fg={theme.overlay0}>{""}</text>}>
      <Match when={props.status.kind === "loading"}>
        <text fg={theme.yellow}>Syncing...</text>
      </Match>
      <Match when={props.status.kind === "error" && props.status}>
        {(status: () => Extract<SyncStatus, { kind: "error" }>) => <text fg={theme.red}>{status().message}</text>}
      </Match>
    </Switch>
  )
}

export function SyncPreview(props: { model: SyncPreviewModel }) {
  const loading = () => props.model.footer.status.kind === "loading"
  return (
    <box width={80} maxHeight="80%" flexDirection="column" backgroundColor={theme.mantle} overflow="hidden">
      {/* Only the list gives way to the panel's maxHeight: a squeezed title or
          footer loses its padding, and the footer folds onto two rows. */}
      <box flexDirection="row" justifyContent="space-between" paddingX={2} paddingY={1} flexShrink={0}>
        <text fg={theme.text}>Sync Changes</text>
        <text fg={theme.overlay0}>esc</text>
      </box>
      {/*
       * The outer box clips and the inner one keeps every row at its natural
       * height, the viewport trick the thread panel uses. Without
       * flexShrink 0 the panel's maxHeight makes the column compress each card
       * below its content height, and its location and body land on the same
       * row, legible as interleaved characters rather than as a cut list.
       */}
      <box flexDirection="column" overflow="hidden" flexShrink={1} paddingX={2} paddingY={1}>
        <box flexDirection="column" flexShrink={0} gap={1}>
          <Show when={props.model.sections.length === 0}>
            <box paddingY={2}>
              <text fg={theme.overlay0}>No changes to sync</text>
            </box>
          </Show>
          <For each={props.model.sections}>
            {(section) => (
              <box flexDirection="column" gap={1}>
                <text fg={theme.subtext0}>{section.title}</text>
                <For each={section.cards}>{(card) => <Card card={card} />}</For>
              </box>
            )}
          </For>
        </box>
      </box>
      <box flexDirection="row" justifyContent="space-between" alignItems="center" paddingX={2} paddingY={1} flexShrink={0}>
        <Status status={props.model.footer.status} />
        <Show when={props.model.footer.button}>
          {(label: () => string) => (
            <box paddingX={2} backgroundColor={loading() ? theme.overlay0 : theme.blue}>
              <text fg={loading() ? theme.surface0 : theme.base}>{label()}</text>
            </box>
          )}
        </Show>
      </box>
    </box>
  )
}
