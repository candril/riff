import { For, Show } from "solid-js"
import { colors, theme } from "../theme"
import { REACTION_META, type ReactionSummary } from "../types"
import type { CommentImage } from "../utils/comment-images"
import { PanelMarkdown, type PanelMarkdownStyle } from "./PanelMarkdown"
import type { ThreadCommentModel, ThreadModel } from "./thread-panel-model"

export function ThreadHeader(props: { thread: ThreadModel }) {
  const header = () => props.thread.header
  return (
    <box flexDirection="row" height={1} marginTop={1} backgroundColor={header().highlighted ? theme.surface0 : undefined}>
      {/*
       * Filename group — flexShrink:1 so the *filename* truncates when the
       * row is too narrow, instead of every child being compressed (which
       * dropped letters mid-word).
       */}
      <box flexDirection="row" flexShrink={1} overflow="hidden">
        <Show when={header().caret}>{(caret: () => string) => <text fg={header().caretFg}>{caret()}</text>}</Show>
        <text fg={theme.overlay0}>{header().divider}</text>
      </box>
      {/* Badges group — flexShrink:0 so author / count / resolved / outdated labels stay readable even on narrow panels. */}
      <box flexDirection="row" flexShrink={0}>
        <Show when={header().author}>{(author: () => string) => <text fg={theme.blue}>{`  ${author()}`}</text>}</Show>
        <Show when={header().badge}>
          {(badge: () => { text: string; fg: string }) => <text fg={badge().fg}>{`  ${badge().text}`}</text>}
        </Show>
        <Show when={header().outdated}>
          <text fg={theme.peach}>{"  ⊘"}</text>
        </Show>
        {/* Something in this thread arrived since your last visit (spec 069). */}
        <Show when={header().unseen}>
          <text fg={theme.blue}>{"  ●"}</text>
        </Show>
      </box>
    </box>
  )
}

/**
 * Each visual line is its own box with `height: 1` (PRInfoPanel pattern).
 * Without explicit per-row height, OpenTUI's column flex doesn't measure
 * text and the rows stack on row 0 of the comment box. The body is a
 * MarkdownRenderable, which self-measures correctly, so its wrapper box
 * doesn't need a fixed height.
 */
export function CommentRow(props: { comment: ThreadCommentModel; markdown: PanelMarkdownStyle }) {
  const comment = () => props.comment
  return (
    <box
      flexDirection="column"
      paddingLeft={comment().indent}
      backgroundColor={comment().highlighted ? theme.surface0 : undefined}
    >
      <box flexDirection="row" height={1}>
        <text fg={comment().caretFg}>{comment().caret}</text>
        <Show when={comment().connector}>
          {(connector: () => string) => <text fg={colors.textDim}>{connector()}</text>}
        </Show>
        <text fg={theme.blue}>{comment().author}</text>
        <text fg={theme.overlay0}>{` ${comment().time}`}</text>
        <text fg={comment().statusFg}>{` [${comment().status}]`}</text>
        <Show when={comment().edited}>
          <text fg={colors.commentPending}>{" *edited"}</text>
        </Show>
        <Show when={comment().editing}>
          <text fg={theme.yellow}>{" (editing)"}</text>
        </Show>
      </box>
      <Show when={comment().bodyText}>
        <box paddingLeft={comment().bodyIndent}>
          <PanelMarkdown id={`inline-overlay-body-${comment().key}`} text={comment().bodyText} style={props.markdown} />
        </box>
      </Show>
      <ImageRows images={comment().images} indent={comment().bodyIndent} />
      <Show when={comment().reactions}>
        {(reactions: () => ReactionSummary[]) => (
          <box flexDirection="row" height={1} paddingLeft={comment().bodyIndent}>
            <Reactions reactions={reactions()} />
          </box>
        )}
      </Show>
    </box>
  )
}

/**
 * Stand-in rows for the pictures a comment carries — the panel can't draw
 * them, so it names them and `O` opens them in the browser. Numbered only
 * when there is more than one, since the number is there to tell the reader
 * which of several `O` is about to open.
 */
function ImageRows(props: { images: CommentImage[]; indent: number }) {
  return (
    <For each={props.images}>
      {(image, i) => (
        <box flexDirection="row" height={1} paddingLeft={props.indent}>
          <text fg={theme.overlay0}>{"▣ "}</text>
          <Show when={props.images.length > 1}>
            <text fg={theme.overlay0}>{`${i() + 1}. `}</text>
          </Show>
          <text fg={theme.sapphire}>{image.label}</text>
        </box>
      )}
    </For>
  )
}

/**
 * The comment's reactions as pills. A pill the viewer added is told apart
 * by its text colour, not a background: the emoji renders cleaner without
 * a block of colour behind it (spec 042).
 */
function Reactions(props: { reactions: ReactionSummary[] }) {
  const shown = () => props.reactions.filter((reaction) => reaction.count > 0 || reaction.viewerHasReacted)
  return (
    <Show when={shown().length > 0}>
      <box flexDirection="row" gap={1} paddingTop={1}>
        <For each={shown()}>
          {(reaction) => (
            <box flexDirection="row" paddingX={1}>
              <text fg={reaction.viewerHasReacted ? theme.blue : theme.subtext1}>
                {`${REACTION_META[reaction.content].emoji} ${reaction.count}`}
              </text>
            </box>
          )}
        </For>
      </box>
    </Show>
  )
}
