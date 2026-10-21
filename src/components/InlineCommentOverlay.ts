/**
 * InlineCommentOverlay — file-scoped comments side panel (spec 039).
 *
 * Right-anchored side panel that lists every comment in the panel's
 * current file, grouped into threads. Single surface for read / reply /
 * edit / delete / resolve / submit / react.
 *
 * Toggled with `Ctrl-t` from the diff (mirrors `Ctrl-b` for the file
 * tree on the opposite side). Focusable like the file tree: `Ctrl-l`
 * enters from the diff, `Ctrl-h` exits, `Ctrl-e` widens it.
 *
 * Rendering only — keystrokes live in
 * `src/features/inline-comment-overlay/input.ts`.
 */

import { Box, Text, MarkdownRenderable, SyntaxStyle, RGBA, type NativeResourceOwner } from "@opentui/core"
import type { CliRenderer } from "@opentui/core"
import { theme, colors } from "../theme"
import { MarkdownBodies } from "./markdown-bodies"
import { PromptInput } from "./PromptInput"
import type { CommentImage } from "../utils/comment-images"
import { softenCommentHtml } from "../utils/comment-html"
import { annotateReferences } from "../utils/references"
import { resolvedReferences, referenceRepo } from "../features/references"
import { tableRenderer } from "./markdown-tables-in-markdown"
import { ReactionRow } from "./ReactionRow"
import { CommentComposer } from "./CommentComposer"
import { bottomThreadHint, topThreadHint } from "./thread-edge-hints"
import {
  displayAuthor,
  threadPanelModel,
  type Hint,
  type ThreadCommentModel,
  type ThreadModel,
  type ThreadPanelInput,
  type ThreadPanelModel,
} from "./thread-panel-model"

export { visibleOverlayCommentIds } from "./thread-panel-model"
export { getFilteredMentionCandidates, MENTION_VISIBLE_LIMIT } from "./thread-panel-picker"

export interface InlineCommentOverlayProps extends ThreadPanelInput {
  renderer: CliRenderer
}

/**
 * Comment bodies. Kept alive across render passes by the shared pool —
 * see `markdown-bodies.ts` for why building them per pass flickered. One
 * pool per renderer, since a body belongs to the renderer that built it.
 */
const pools = new WeakMap<CliRenderer, MarkdownBodies>()

function bodyPool(renderer: CliRenderer): MarkdownBodies {
  const existing = pools.get(renderer)
  if (existing) return existing
  const pool = new MarkdownBodies(renderer)
  pools.set(renderer, pool)
  return pool
}

function buildMarkdown(
  renderer: CliRenderer,
  id: string,
  content: string
): MarkdownRenderable {
  return bodyPool(renderer).mount(
    id,
    // The renderer has no case for HTML tokens, so the tags people write
    // in GitHub comments would land here verbatim. A bare `#412` gets the
    // title of what it points at, once riff has been told (spec 059).
    annotateReferences(softenCommentHtml(content), resolvedReferences(), referenceRepo()),
    {
      renderNode: tableRenderer(renderer, () => renderer.width),
      syntaxStyle: getSyntaxStyle(renderer.nativeScene),
    }
  )
}

/**
 * Stand-in rows for the pictures a comment carries — the panel can't draw
 * them, so it names them and `O` opens them in the browser. Numbered only
 * when there is more than one, since the number is there to tell the reader
 * which of several `O` is about to open.
 */
function imageRows(images: readonly CommentImage[], indent: number) {
  return images.map((image, i) =>
    Box(
      { flexDirection: "row", height: 1, paddingLeft: indent },
      Text({ content: "▣ ", fg: theme.overlay0 }),
      images.length > 1
        ? Text({ content: `${i + 1}. `, fg: theme.overlay0 })
        : null,
      Text({ content: image.label, fg: theme.sapphire })
    )
  )
}

// Tests run several renderers in one process, and a style dies with the renderer that owns it.
const syntaxStyles = new WeakMap<NativeResourceOwner, SyntaxStyle>()
function getSyntaxStyle(owner: NativeResourceOwner): SyntaxStyle {
  if (!syntaxStyles.has(owner)) {
    syntaxStyles.set(owner, SyntaxStyle.fromStyles({
      "markup.heading": { fg: RGBA.fromHex(theme.blue), bold: true },
      "markup.strong": { bold: true },
      "markup.italic": { italic: true },
      "markup.raw": { fg: RGBA.fromHex(theme.green) },
      "markup.strikethrough": { dim: true },
      "markup.link": { fg: RGBA.fromHex(theme.blue) },
      "markup.link.label": { fg: RGBA.fromHex(theme.blue), underline: true },
      "markup.link.url": { fg: RGBA.fromHex(theme.subtext0) },
      "markup.list": { fg: RGBA.fromHex(theme.yellow) },
      "punctuation.special": { fg: RGBA.fromHex(theme.subtext0), italic: true },
      "keyword": { fg: RGBA.fromHex(theme.mauve) },
      "string": { fg: RGBA.fromHex(theme.green) },
      "number": { fg: RGBA.fromHex(theme.peach) },
      "comment": { fg: RGBA.fromHex(theme.overlay0), italic: true },
      "function": { fg: RGBA.fromHex(theme.blue) },
      "type": { fg: RGBA.fromHex(theme.yellow) },
      "variable": { fg: RGBA.fromHex(theme.text) },
      "operator": { fg: RGBA.fromHex(theme.sky) },
      "punctuation": { fg: RGBA.fromHex(theme.overlay2) },
      "property": { fg: RGBA.fromHex(theme.lavender) },
      "constant": { fg: RGBA.fromHex(theme.peach) },
    }, owner))
  }
  return syntaxStyles.get(owner)!
}

function renderHintRow(hints: Hint[]) {
  // PRInfoPanel pattern: rows must declare `height: 1` or OpenTUI's
  // column flex won't measure Text height, and the parent stacks
  // siblings on top of each other (or wraps Text columns weirdly).
  const children = []
  for (let i = 0; i < hints.length; i++) {
    const [key, label] = hints[i]!
    children.push(Text({ content: key, fg: theme.yellow }))
    children.push(Text({
      content: i === hints.length - 1 ? ` ${label}` : ` ${label}  `,
      fg: theme.subtext0,
    }))
  }
  return Box({ flexDirection: "row", height: 1 }, ...children)
}

function pickerFooter() {
  return Box(
    { flexDirection: "row", height: 1 },
    Text({ content: "↑↓ nav  ", fg: theme.overlay0 }),
    Text({ content: "Tab/⏎ accept  ", fg: theme.overlay0 }),
    Text({ content: "Esc dismiss", fg: theme.overlay0 })
  )
}

function pickerRow(selected: boolean, accent: string, ...cells: ReturnType<typeof Text>[]) {
  return Box(
    {
      flexDirection: "row",
      height: 1,
      backgroundColor: selected ? theme.surface0 : undefined,
    },
    Text({
      content: selected ? "▸ " : "  ",
      fg: selected ? accent : theme.overlay0,
    }),
    ...cells
  )
}

function renderPicker(picker: NonNullable<ThreadPanelModel["picker"]>) {
  switch (picker.kind) {
    case "emoji-empty":
      return Box(
        {
          flexDirection: "column",
          marginTop: 1,
          paddingX: 1,
          backgroundColor: theme.mantle,
        },
        Text({ content: picker.text, fg: theme.overlay0 })
      )
    case "emoji":
      return Box(
        {
          flexDirection: "column",
          paddingX: 1,
          backgroundColor: theme.mantle,
        },
        Box({ flexDirection: "row", height: 1 }, Text({ content: ":emoji", fg: theme.yellow })),
        ...picker.rows.map((emoji, i) =>
          pickerRow(
            i === picker.selected,
            theme.yellow,
            Text({ content: `${emoji.char}  `, fg: theme.text }),
            Text({ content: `:${emoji.name}:`, fg: theme.subtext0 })
          )
        ),
        pickerFooter()
      )
    case "mention-empty":
      return Box(
        {
          flexDirection: "column",
          marginTop: 1,
          paddingX: 1,
          paddingY: 0,
          backgroundColor: theme.mantle,
        },
        Text({ content: picker.text, fg: theme.overlay0 })
      )
    case "mention":
      return Box(
        {
          flexDirection: "column",
          marginTop: 1,
          paddingX: 1,
          paddingY: 0,
          backgroundColor: theme.mantle,
        },
        Box(
          { flexDirection: "row", height: 1 },
          Text({ content: "@mention", fg: theme.blue })
        ),
        ...picker.rows.map((name, i) =>
          pickerRow(i === picker.selected, theme.blue, Text({ content: displayAuthor(name), fg: theme.text }))
        ),
        pickerFooter()
      )
  }
}

function renderThreadHeader({ header }: ThreadModel) {
  return Box(
    {
      flexDirection: "row",
      height: 1,
      marginTop: 1,
      backgroundColor: header.highlighted ? theme.surface0 : undefined,
    },
    // Filename group — flexShrink:1 so the *filename* truncates
    // when the row is too narrow, instead of every child being
    // compressed (which dropped letters mid-word).
    Box(
      { flexDirection: "row", flexShrink: 1, overflow: "hidden" },
      header.caret !== null ? Text({ content: header.caret, fg: header.caretFg }) : null,
      Text({ content: header.divider, fg: theme.overlay0 })
    ),
    // Badges group — flexShrink:0 so author / count / resolved /
    // outdated labels stay readable even on narrow panels.
    Box(
      { flexDirection: "row", flexShrink: 0 },
      header.author !== null ? Text({ content: `  ${header.author}`, fg: theme.blue }) : null,
      header.badge ? Text({ content: `  ${header.badge.text}`, fg: header.badge.fg }) : null,
      header.outdated ? Text({ content: "  ⊘", fg: theme.peach }) : null,
      // Something in this thread arrived since your last visit (spec 069).
      header.unseen ? Text({ content: "  ●", fg: theme.blue }) : null
    )
  )
}

function renderComment(renderer: CliRenderer, comment: ThreadCommentModel) {
  // Each visual line is its own Box with `height: 1` (PRInfoPanel
  // pattern). Without explicit per-row height, OpenTUI's column flex
  // doesn't measure Text and the rows stack on row 0 of the comment Box.
  // The body uses a MarkdownRenderable, which self-measures correctly, so
  // its wrapper Box doesn't need a fixed height.
  return Box(
    {
      flexDirection: "column",
      paddingLeft: comment.indent,
      backgroundColor: comment.highlighted ? theme.surface0 : undefined,
    },
    Box(
      { flexDirection: "row", height: 1 },
      Text({ content: comment.caret, fg: comment.caretFg }),
      comment.connector !== null ? Text({ content: comment.connector, fg: colors.textDim }) : null,
      Text({ content: comment.author, fg: theme.blue }),
      Text({ content: ` ${comment.time}`, fg: theme.overlay0 }),
      Text({ content: ` [${comment.status}]`, fg: comment.statusFg }),
      comment.edited ? Text({ content: " *edited", fg: colors.commentPending }) : null,
      comment.editing ? Text({ content: " (editing)", fg: theme.yellow }) : null
    ),
    comment.bodyText
      ? Box(
          { paddingLeft: comment.bodyIndent },
          buildMarkdown(renderer, `inline-overlay-body-${comment.key}`, comment.bodyText)
        )
      : null,
    ...imageRows(comment.images, comment.bodyIndent),
    comment.reactions
      ? Box(
          { flexDirection: "row", height: 1, paddingLeft: comment.bodyIndent },
          ReactionRow({ reactions: comment.reactions })
        )
      : null
  )
}

export function InlineCommentOverlay({ renderer, ...input }: InlineCommentOverlayProps) {
  bodyPool(renderer).begin()
  const model = threadPanelModel({ ...input, now: Date.now() })
  const { header } = model

  const panel = Box(
    {
      // A column of the content row (app/shell.tsx), narrowed only where it and the tree overflow the screen.
      width: input.width,
      flexShrink: 1,
      height: "100%",
      flexDirection: "column",
      // Mantle against the diff's base is what sets the panel apart.
      backgroundColor: theme.mantle,
      paddingX: 1,
      overflow: "hidden",
    },
    // Header — file + comment count. Mirrors the file tree header: 1-row tall,
    // single-column padding, mantle background. Focus is signalled by
    // the header text's colour alone.
    Box(
      {
        flexDirection: "row",
        justifyContent: "space-between",
        height: 1,
        paddingLeft: 1,
        paddingRight: 1,
        backgroundColor: theme.mantle,
      },
      header.filterInput
        ? Box(
            { flexDirection: "row", flexGrow: 1 },
            Text({ content: "/", fg: colors.secondary }),
            PromptInput(renderer, "comments-filter")
          )
        : Text({
            content: header.filterText !== null ? `${header.label}  /${header.filterText}` : header.label,
            fg: header.labelFg,
          }),
      header.right !== null ? Text({ content: header.right, fg: header.rightFg }) : null
    ),

      // Thread list (or empty-state hint). Two nested boxes reproduce a
      // scroll viewport without a ScrollBox — deliberately, since we
      // never actually scroll (the panel is rebuilt every frame and we
      // fake scrolling by windowing which threads render, so a real
      // scrollbar's thumb would just recompute and flicker each frame
      // while showing a bogus position).
      //
      //  - Outer box: `overflow: hidden` on a flexGrow child of the
      //    fixed-height panel — a clipping viewport (this is exactly what
      //    ScrollBox's viewport is under the hood).
      //  - Inner box: `flexShrink: 0` so the comment stack keeps each
      //    box at its text's natural height and simply overflows, instead
      //    of the flex column compressing them below that height — which
      //    crushed the Text renderables into each other (the "scramble"
      //    that a smaller terminal font hid by giving the panel more rows).
      !model.empty
        ? Box(
            {
              flexDirection: "column",
              overflow: "hidden",
              flexGrow: 1,
              width: "100%",
              paddingLeft: 2,
              paddingRight: 2,
              paddingTop: 1,
              paddingBottom: 1,
            },
            Box(
              {
                flexDirection: "column",
                width: "100%",
                flexShrink: 0,
                gap: 1,
              },
              ...model.threads.flatMap((thread) => [
                renderThreadHeader(thread),
                ...thread.comments.map((comment) => renderComment(renderer, comment)),
              ])
            ),
            topThreadHint(model.window.before),
            bottomThreadHint(model.threadSizes, model.window.after)
          )
        : Box(
            { flexDirection: "column", paddingX: 2, paddingY: 1 },
            Text({
              content: "No comments in this file yet.",
              fg: theme.overlay0,
            })
          ),

      // Inline composer (compose / edit modes). `flexShrink: 0` — the
      // thread viewport above has a huge flex basis (its inner stack
      // never shrinks), and Yoga spreads the overflow across every
      // shrinkable sibling by basis, so without this the composer lost
      // rows too: its label row collapsed onto the textarea (label and
      // placeholder glyphs interleaved) and its bottom edge was clipped
      // off the panel.
      model.composer
        ? Box(
            { flexDirection: "column", paddingX: 1, paddingY: 1, flexShrink: 0 },
            // A picker floats above the composer rather than sitting under
            // it: laid out in the column it would push the box you are
            // typing in up the screen on every `:` and back down on every
            // space (specs 046, 082).
            model.picker
              ? Box(
                  { position: "absolute", bottom: "100%", left: 1, right: 1, zIndex: 60 },
                  renderPicker(model.picker)
                )
              : null,
            CommentComposer({
              mode: model.composer.mode,
              label: model.composer.label,
              renderer,
            })
          )
        : null,

    // 1-row tall to match the header and the file tree's tight shell.
    // While composing the row is not drawn: the composer's keys would not
    // fit the panel's width, so they are listed in the help overlay (g?)
    // and the row goes to the threads.
    model.hints
      ? Box(
          {
            flexDirection: "row",
            height: 1,
            paddingLeft: 1,
            paddingRight: 1,
            backgroundColor: theme.mantle,
          },
          renderHintRow(model.hints)
        )
      : null
  )

  bodyPool(renderer).end()
  return panel
}
