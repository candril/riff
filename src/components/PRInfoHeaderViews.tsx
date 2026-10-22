import { Show } from "solid-js"
import { colors, theme } from "../theme"
import type { PanelMeta, SectionHeaderRow, StackLine } from "./pr-info-header"

/**
 * One section header of the PR info panel: label, indicator, title and
 * count, then the collapsed preview, and the verdict at the right end. Like
 * the meta row, the left part is one text cut at the edge rather than a row
 * of texts sharing out the shrink; the verdict never shrinks, so a narrow
 * panel cuts the title before it loses the answer.
 */
export function PRInfoSectionHeader(props: { row: SectionHeaderRow }) {
  return (
    <box flexDirection="row" height={1} backgroundColor={props.row.highlighted ? theme.surface0 : undefined}>
      <text wrapMode="none" flexShrink={1} minWidth={0}>
        <Show when={props.row.label}>
          {(label: () => string) => <span style={{ fg: colors.flashLabel }}>{`${label()} `}</span>}
        </Show>
        <span style={{ fg: props.row.fg }}>{props.row.text}</span>
        <Show when={props.row.preview}>
          {(preview: () => string) => <span style={{ fg: theme.subtext0 }}>{`  ${preview()}`}</span>}
        </Show>
      </text>
      <Show when={props.row.trailing}>
        {(trailing: () => { text: string; fg: string }) => (
          <>
            <box flexGrow={1} minWidth={1} />
            <text wrapMode="none" flexShrink={0} fg={trailing().fg}>
              {trailing().text}
            </text>
          </>
        )}
      </Show>
    </box>
  )
}

/** The PR info panel's top: who, which branches and who approves, then what it is stacked on. */
export function PRInfoMeta(props: { meta: PanelMeta; stack: StackLine }) {
  return (
    <>
      {/* One text rather than a row of them: Yoga shares an overflowing
          row's shrink out between sibling texts in fractions, rounded
          differently once the tree around them has been laid out, so the same
          row can glue the author to the branches on one panel and not on the
          next. A single text is simply cut at the edge. */}
      <text height={1} width="100%" wrapMode="none">
        <span style={{ fg: theme.blue }}>{`@${props.meta.author}`}</span>
        <span style={{ fg: theme.overlay0 }}>{"  "}</span>
        <span style={{ fg: theme.subtext0 }}>{props.meta.branches}</span>
        <Show when={props.meta.approvers.length > 0}>
          <span style={{ fg: theme.green }}>{`   ✓ ${props.meta.approvers.map((name) => `@${name}`).join(" ")}`}</span>
        </Show>
      </text>
      <text fg={props.stack.fg} visible={props.stack.visible}>
        {props.stack.text}
      </text>
    </>
  )
}
