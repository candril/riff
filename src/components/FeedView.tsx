import { For, Match, Show, Switch } from "solid-js"
import type { InputRenderable } from "@opentui/core"
import { colors, theme } from "../theme"
import {
  FILE_INDENT,
  type FeedEventRow,
  type FeedFileRow,
  type FeedHeader,
  type FeedLegend,
  type FeedModel,
  type FeedModelRow,
  type FeedTone,
} from "./feed-model"

const TONE: Record<FeedTone, string> = {
  text: colors.text,
  dim: colors.textDim,
  subtext0: theme.subtext0,
  subtext1: theme.subtext1,
  green: theme.green,
  red: theme.red,
  peach: theme.peach,
  mauve: theme.mauve,
  yellow: theme.yellow,
}

/** The three cells after a legend entry, which shrink before any text does. */
const Gap = () => <box width={3} height={1} flexShrink={1} />

const rowBackground = (selected: boolean) => (selected ? theme.surface0 : undefined)

function Header(props: { header: FeedHeader }) {
  return (
    <box flexDirection="row" height={1} width="100%">
      <text fg={colors.headerFg}>Feed</text>
      <text fg={colors.textDim}>{`   ${props.header.countText} · ${props.header.scope}${props.header.loadingSuffix}`}</text>
      <text fg={colors.textDim}>{"  "}</text>
      <Show when={props.header.unseenCount > 0}>
        <text fg={theme.blue}>{`● ${props.header.unseenCount} unseen`}</text>
      </Show>
    </box>
  )
}

/**
 * The toggles, or the filter's field while it is typed. The field row is
 * hidden rather than unmounted: unmounting it would take PromptInput's field
 * down with it.
 */
function Legend(props: { legend: FeedLegend; field: InputRenderable }) {
  return (
    <>
      <box visible={props.legend.filterInput} flexDirection="row" height={1} width="100%">
        <text fg={colors.secondary}>/</text>
        {props.field}
      </box>
      {/* A toggle that is on is said in full colour, one that is off in dim —
          the key letter is the only accent, so the row reads as a legend.
          The legend is wider than its row at 100 columns. Only the gaps give
          way: a squeezed text is cut wherever its last measure left it, and
          the same legend would draw differently depending on what it showed
          before. */}
      <box visible={!props.legend.filterInput} flexDirection="row" height={1} width="100%" overflow="hidden">
        <For each={props.legend.toggles}>
          {(toggle) => (
            <>
              <text fg={toggle.on ? theme.peach : colors.textDim} flexShrink={0}>{` ${toggle.key} `}</text>
              <text fg={toggle.on ? colors.text : colors.textDim} flexShrink={0}>{toggle.label}</text>
              <Gap />
            </>
          )}
        </For>
        <text fg={colors.textDim} flexShrink={0}>{" / "}</text>
        <text fg={props.legend.filter ? colors.text : colors.textDim} flexShrink={0}>
          {props.legend.filter || "filter"}
        </text>
        <Gap />
        <Show when={props.legend.narrowed}>
          <text fg={colors.textDim} flexShrink={0}>{" esc all"}</text>
        </Show>
      </box>
    </>
  )
}

function EventRow(props: { row: FeedEventRow }) {
  return (
    <box flexDirection="row" height={1} width="100%" backgroundColor={rowBackground(props.row.selected)}>
      <box flexDirection="row" flexShrink={0}>
        <text fg={colors.flashLabel}>{props.row.flashCell}</text>
        <text fg={colors.textDim}>{props.row.timeCell}</text>
        {/* One cell for the row's state: new to you, or answered. */}
        <Switch fallback={<text fg={theme.blue}>{"   "}</text>}>
          <Match when={props.row.state === "unseen"}>
            <text fg={theme.blue}>{" ● "}</text>
          </Match>
          <Match when={props.row.state === "resolved"}>
            <text fg={theme.green}>{" ✓ "}</text>
          </Match>
        </Switch>
        <text fg={TONE[props.row.typeTone]}>{props.row.typeLabel}</text>
        <text fg={theme.subtext0}>{props.row.actorCell}</text>
        <text fg={colors.textDim}>{props.row.leadCell}</text>
      </box>
      <box flexDirection="row" flexGrow={1} flexShrink={1} overflow="hidden">
        <text fg={TONE[props.row.titleTone]}>{props.row.title}</text>
        <Show when={props.row.note}>{(note: () => string) => <text fg={colors.textDim}>{`  ${note()}`}</text>}</Show>
      </box>
      <Show when={props.row.trailing}>
        {(trailing: () => string) => (
          <box flexDirection="row" flexShrink={0}>
            <text fg={TONE[props.row.trailingTone]}>{`  ${trailing()}`}</text>
          </box>
        )}
      </Show>
    </box>
  )
}

/** One file of an opened commit — a row of its own, so it can be picked. */
function FileRow(props: { row: FeedFileRow }) {
  return (
    <box flexDirection="row" height={1} width="100%" backgroundColor={rowBackground(props.row.selected)}>
      <text fg={colors.flashLabel}>{props.row.flashCell}</text>
      <text fg={props.row.selected ? colors.text : theme.subtext0}>
        {`${" ".repeat(FILE_INDENT - 2)}${props.row.branch} ${props.row.filename}`}
      </text>
      <text fg={theme.green}>{`  +${props.row.additions}`}</text>
      <text fg={theme.red}>{` -${props.row.deletions}`}</text>
    </box>
  )
}

function Row(props: { row: FeedModelRow }) {
  return (
    <Switch>
      <Match when={props.row.kind === "event" && props.row}>{(row: () => FeedEventRow) => <EventRow row={row()} />}</Match>
      <Match when={props.row.kind === "file" && props.row}>{(row: () => FeedFileRow) => <FileRow row={row()} />}</Match>
      <Match when={props.row.kind === "loading"}>
        {/* Opened before its files have arrived: a line, not a row — there is nothing to land on yet. */}
        <box flexDirection="row" height={1}>
          <text fg={colors.textDim}>{`${" ".repeat(FILE_INDENT)}loading…`}</text>
        </box>
      </Match>
    </Switch>
  )
}

/**
 * The activity feed (spec 070), one row per event, newest first. It is
 * content, like the diff, so it stays on base and only the selected row is
 * shaded; an empty row, not a line, sets the legend apart from the rows.
 */
export function FeedView(props: { model: FeedModel; field: InputRenderable }) {
  return (
    <>
      <Header header={props.model.header} />
      <Legend legend={props.model.legend} field={props.field} />
      <box height={1} />
      <Show when={props.model.empty} fallback={<For each={props.model.rows}>{(row) => <Row row={row} />}</For>}>
        {(empty: () => string) => <text fg={colors.textDim}>{empty()}</text>}
      </Show>
    </>
  )
}
