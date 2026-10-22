import type { BoxRenderable } from "@opentui/core"
import { createMemo, For, Show, type JSX } from "solid-js"
import { colors, theme } from "../theme"
import type { PanelMarkdownStyle } from "./PanelMarkdown"
import { BottomThreadHint, TopThreadHint } from "./ThreadEdgeHints"
import { ThreadPanelPickerView, type Picker } from "./ThreadPanelPicker"
import { CommentRow, ThreadHeader } from "./ThreadPanelRows"
import type { Hint, ThreadCommentModel, ThreadModel, ThreadPanelHeader, ThreadPanelModel } from "./thread-panel-model"

/**
 * The thread panel's contents (spec 039): a header, the threads in their
 * clipping viewport, the composer while one is open and the key hints.
 * The filter field and the composer's textarea outlive any one model, so
 * they are handed in and only ever hidden, never unmounted: a node Solid
 * removes is destroyed on the next tick, and they would go with it.
 *
 * Keystrokes live in `src/features/inline-comment-overlay/view-keys.ts` and
 * `composer-keys.ts`.
 */
export function ThreadPanelView(props: {
  model: ThreadPanelModel
  field: JSX.Element
  composer: JSX.Element
  markdown: PanelMarkdownStyle
  /** The threads' clipping viewport, for the half-page motions to read their layout off. */
  viewportRef?: (viewport: BoxRenderable) => void
}) {
  return (
    <>
      <PanelHeader header={props.model.header} field={props.field} />
      <Show
        when={!props.model.empty}
        fallback={
          <box flexDirection="column" paddingX={2} paddingY={1}>
            <text fg={theme.overlay0}>{props.model.emptyText}</text>
          </box>
        }
      >
        <Threads model={props.model} markdown={props.markdown} viewportRef={props.viewportRef} />
      </Show>
      <Composer model={props.model} textarea={props.composer} />
      {/*
       * 1-row tall to match the header and the file tree's tight shell.
       * While composing the row is not drawn: the composer's keys would not
       * fit the panel's width, so they are listed in the help overlay (g?)
       * and the row goes to the threads.
       */}
      <Show when={props.model.hints}>
        {(hints: () => Hint[]) => (
          <box flexDirection="row" height={1} paddingLeft={1} paddingRight={1} backgroundColor={theme.mantle}>
            <HintRow hints={hints()} />
          </box>
        )}
      </Show>
    </>
  )
}

/**
 * File and comment count. Mirrors the file tree header: 1-row tall,
 * single-column padding, mantle background. Focus is signalled by the
 * header text's colour alone.
 */
function PanelHeader(props: { header: ThreadPanelHeader; field: JSX.Element }) {
  const label = () =>
    props.header.filterText !== null ? `${props.header.label}  /${props.header.filterText}` : props.header.label
  return (
    <box
      flexDirection="row"
      justifyContent="space-between"
      height={1}
      paddingLeft={1}
      paddingRight={1}
      backgroundColor={theme.mantle}
    >
      <box visible={props.header.filterInput} flexDirection="row" flexGrow={1}>
        <text fg={colors.secondary}>/</text>
        {props.field}
      </box>
      <text visible={!props.header.filterInput} fg={props.header.labelFg}>
        {label()}
      </text>
      {/*
       * Grows into the gap so the count stays right-aligned. The outsized
       * shrink makes it give up its columns before the label or the count
       * lose any, which then share what is left as they did without it.
       */}
      <box
        visible={!props.header.filterInput && props.header.note !== null}
        flexGrow={1}
        flexShrink={1000}
        minWidth={0}
        paddingRight={1}
        overflow="hidden"
      >
        <text fg={props.header.noteFg} wrapMode="none">
          {props.header.note ? `  ${props.header.note}` : ""}
        </text>
      </box>
      <Show when={props.header.right}>{(right: () => string) => <text fg={props.header.rightFg}>{right()}</text>}</Show>
    </box>
  )
}

/**
 * The thread list. Two nested boxes reproduce a scroll viewport without a
 * ScrollBox — deliberately, since nothing here scrolls by rows: the window
 * is whole threads, chosen around the highlight by `thread-panel-window.ts`,
 * so a real scrollbar's thumb would show a position that means nothing.
 *
 *  - Outer box: `overflow: hidden` on a flexGrow child of the fixed-height
 *    panel — a clipping viewport (this is exactly what ScrollBox's viewport
 *    is under the hood).
 *  - Inner box: `flexShrink: 0` so the comment stack keeps each box at its
 *    text's natural height and simply overflows, instead of the flex column
 *    compressing them below that height — which crushed the Text renderables
 *    into each other (the "scramble" that a smaller terminal font hid by
 *    giving the panel more rows).
 *
 * The stack's children are flat, each thread's header and then its
 * comments, and come first in the viewport: the bottom hint counts threads
 * by walking them.
 */
function Threads(props: {
  model: ThreadPanelModel
  markdown: PanelMarkdownStyle
  viewportRef?: (viewport: BoxRenderable) => void
}) {
  const rows = createMemo(() =>
    props.model.threads.flatMap((thread): (ThreadModel | ThreadCommentModel)[] => [thread, ...thread.comments])
  )
  return (
    <box
      ref={props.viewportRef}
      flexDirection="column"
      overflow="hidden"
      flexGrow={1}
      width="100%"
      paddingLeft={2}
      paddingRight={2}
      paddingTop={1}
      paddingBottom={1}
    >
      <box flexDirection="column" width="100%" flexShrink={0} gap={1}>
        <For each={rows()}>
          {(row) =>
            "header" in row ? (
              <ThreadHeader thread={row} />
            ) : (
              <CommentRow comment={row} markdown={props.markdown} />
            )
          }
        </For>
      </box>
      <TopThreadHint before={props.model.window.before} />
      <BottomThreadHint threadSizes={props.model.threadSizes} after={props.model.window.after} />
    </box>
  )
}

/**
 * The inline composer (compose / edit modes). `flexShrink: 0` — the thread
 * viewport above has a huge flex basis (its inner stack never shrinks), and
 * Yoga spreads the overflow across every shrinkable sibling by basis, so
 * without this the composer lost rows too: its label row collapsed onto the
 * textarea (label and placeholder glyphs interleaved) and its bottom edge
 * was clipped off the panel.
 */
function Composer(props: { model: ThreadPanelModel; textarea: JSX.Element }) {
  return (
    <box visible={props.model.composer !== null} flexDirection="column" paddingX={1} paddingY={1} flexShrink={0}>
      {/*
       * A picker floats above the composer rather than sitting under it:
       * laid out in the column it would push the box you are typing in up
       * the screen on every `:` and back down on every space (specs 046, 082).
       */}
      <Show when={props.model.picker}>
        {(picker: () => Picker) => (
          <box position="absolute" bottom="100%" left={1} right={1} zIndex={60}>
            <ThreadPanelPickerView picker={picker()} />
          </box>
        )}
      </Show>
      <box flexDirection="column" paddingX={1} paddingY={0} backgroundColor={theme.surface0}>
        {/* `height: 1` so the row keeps its line under flex pressure — without it the label collapses to zero rows and paints over the textarea. */}
        <box flexDirection="row" height={1}>
          <text fg={theme.blue}>{props.model.composer?.label ?? ""}</text>
        </box>
        {props.textarea}
      </box>
    </box>
  )
}

/**
 * PRInfoPanel pattern: rows must declare `height: 1` or OpenTUI's column
 * flex won't measure Text height, and the parent stacks siblings on top of
 * each other (or wraps Text columns weirdly).
 */
function HintRow(props: { hints: Hint[] }) {
  return (
    <box flexDirection="row" height={1}>
      <For each={props.hints}>
        {(hint, i) => (
          <>
            <text fg={theme.yellow}>{hint[0]}</text>
            <text fg={theme.subtext0}>{i() === props.hints.length - 1 ? ` ${hint[1]}` : ` ${hint[1]}  `}</text>
          </>
        )}
      </For>
    </box>
  )
}
