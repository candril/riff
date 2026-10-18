/**
 * The Submit Review modal.
 *
 * Controls:
 * - 1/2/3 (in comments section): Select review type
 * - Tab: Toggle between summary and comments
 * - Enter / Ctrl-s: Submit
 * - j/k, Space (in comments section): Navigate and toggle comments
 *
 * The summary is an OpenTUI textarea, so paste, undo/redo, word jumps, etc.
 * work for free. What it holds is its owner's to seed and read, through
 * `onSummary`.
 */

import { For, Show } from "solid-js"
import type { TextareaRenderable } from "@opentui/core"
import { theme } from "../theme"
import type {
  ReviewBanner,
  ReviewCheckboxTone,
  ReviewCommentRow,
  ReviewEvent,
  ReviewPreviewModel,
  ReviewStatusTone,
} from "./review-preview-model"

export interface ReviewPreviewProps {
  model: ReviewPreviewModel
  onSummary(textarea: TextareaRenderable): void
  onSummaryChange(value: string): void
}

const PLACEHOLDER = "Summary (optional) — Enter to submit, Ctrl-J for a newline, Esc to cancel"

const EVENT_COLORS: Record<ReviewEvent, string> = {
  COMMENT: theme.blue,
  APPROVE: theme.green,
  REQUEST_CHANGES: theme.peach,
}

const CHECKBOX_COLORS: Record<ReviewCheckboxTone, string> = {
  pending: theme.yellow,
  included: theme.green,
  excluded: theme.overlay0,
}

const STATUS_COLORS: Record<ReviewStatusTone, string> = {
  submitting: theme.yellow,
  error: theme.red,
  hint: theme.yellow,
  idle: theme.overlay0,
}

const pendingTitle = (count: number) => `! Pending review on GitHub (${count} comment${count !== 1 ? "s" : ""})`

function Banner(props: { banner: ReviewBanner }) {
  return (
    <Show
      when={props.banner.kind === "pending" && props.banner}
      fallback={
        <box flexDirection="row" paddingX={2} paddingY={1}>
          <text fg={theme.overlay0}>Checking for pending review...</text>
        </box>
      }
    >
      {(banner: () => Extract<ReviewBanner, { kind: "pending" }>) => (
        <box flexDirection="column" paddingX={2} paddingY={1} backgroundColor={theme.yellow + "20"}>
          <text fg={theme.yellow}>{pendingTitle(banner().count)}</text>
          <text fg={theme.subtext0}>{"  Will be merged with your new comments on submit"}</text>
        </box>
      )}
    </Show>
  )
}

function CommentRow(props: { row: ReviewCommentRow }) {
  return (
    <box flexDirection="row" height={1} paddingX={1} backgroundColor={props.row.highlighted ? theme.surface0 : undefined}>
      <box width={2} height={1} flexShrink={0}>
        <text fg={CHECKBOX_COLORS[props.row.checkboxTone]}>{props.row.checkbox}</text>
      </box>
      <text fg={theme.blue}>{`${props.row.fileLabel} `}</text>
      <text fg={theme.subtext0}>{props.row.preview}</text>
    </box>
  )
}

export function ReviewPreview(props: ReviewPreviewProps) {
  let summary!: TextareaRenderable
  const selectedColor = () => EVENT_COLORS[props.model.chips.find((chip) => chip.selected)?.event ?? "COMMENT"]
  return (
    <box width={72} flexDirection="column" backgroundColor={theme.mantle}>
      <box flexDirection="row" justifyContent="space-between" paddingX={2} paddingY={1} backgroundColor={theme.mantle}>
        <text fg={theme.text}>Submit Review</text>
        <text fg={theme.overlay0}>Esc to close</text>
      </box>
      <Show when={props.model.banner}>{(banner: () => ReviewBanner) => <Banner banner={banner()} />}</Show>
      <box flexDirection="row" gap={3} paddingX={2} paddingY={1}>
        <For each={props.model.chips}>
          {(chip) => (
            <box paddingX={1} backgroundColor={chip.selected ? EVENT_COLORS[chip.event] : undefined}>
              <text fg={chip.selected ? theme.base : theme.subtext0}>{chip.label}</text>
            </box>
          )}
        </For>
      </box>
      <box flexDirection="column" paddingX={2} paddingY={1}>
        <text fg={props.model.summaryFocused ? theme.text : theme.subtext0}>
          {props.model.summaryFocused ? "Summary (editing)" : "Summary"}
        </text>
        <box marginTop={1} minHeight={3}>
          <textarea
            ref={(textarea: TextareaRenderable) => {
              summary = textarea
              props.onSummary(textarea)
            }}
            id="review-summary-composer"
            backgroundColor={theme.surface0}
            textColor={theme.text}
            focusedBackgroundColor={theme.surface0}
            focusedTextColor={theme.text}
            placeholder={PLACEHOLDER}
            placeholderColor={theme.overlay0}
            cursorColor={theme.blue}
            cursorStyle={{ style: "block", blinking: true }}
            wrapMode="word"
            flexGrow={1}
            minHeight={3}
            maxHeight={10}
            onContentChange={() => props.onSummaryChange(summary.plainText)}
          />
        </box>
      </box>
      <Show when={props.model.validCount > 0}>
        <box flexDirection="column" paddingX={2} paddingY={1}>
          <text fg={props.model.commentsFocused ? theme.text : theme.subtext0}>
            {`Comments (${props.model.includedCount}/${props.model.validCount})` +
              (props.model.commentsFocused ? " - j/k, space" : "")}
          </text>
          <box flexDirection="column" marginTop={1} maxHeight={8} overflow="hidden">
            <For each={props.model.comments}>{(row) => <CommentRow row={row} />}</For>
            <Show when={props.model.moreCount > 0}>
              <box paddingX={1}>
                <text fg={theme.overlay0}>{`+${props.model.moreCount} more`}</text>
              </box>
            </Show>
          </box>
        </box>
      </Show>
      <box
        flexDirection="row"
        justifyContent="space-between"
        alignItems="center"
        paddingX={2}
        paddingY={1}
        backgroundColor={theme.mantle}
      >
        <text fg={STATUS_COLORS[props.model.status.tone]}>{props.model.status.text}</text>
        <box paddingX={2} backgroundColor={props.model.submitEnabled ? selectedColor() : theme.surface0}>
          <text fg={props.model.submitEnabled ? theme.base : theme.overlay0}>Enter</text>
        </box>
      </box>
    </box>
  )
}
