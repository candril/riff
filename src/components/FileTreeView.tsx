import { For, Show } from "solid-js"
import type { InputRenderable, ScrollBoxRenderable } from "@opentui/core"
import { colors, theme } from "../theme"
import type { FileTreeModel } from "./file-tree-model"
import type { OverflowHints } from "./overflow-hints"

/**
 * What the view draws. The flat items stay out: they carry the tree's nodes,
 * which a keyed reconcile would walk on every pass for nothing drawn. The
 * hints come from the island, since only it knows where the list is scrolled.
 */
export type FileTreeViewModel = Omit<FileTreeModel, "items"> & { overflow: OverflowHints }

/**
 * The header row: the label, or the `/` prompt while the filter is typed.
 * Both are hidden rather than unmounted, so the field is never destroyed
 * with the box it sits in.
 */
function Header(props: { header: FileTreeViewModel["header"]; field: InputRenderable }) {
  return (
    <box
      height={1}
      width="100%"
      paddingLeft={1}
      flexDirection="row"
      backgroundColor={props.header.filtering ? theme.surface0 : theme.mantle}
    >
      {/* The header lays its children out in a row; a text with no basis measures as zero wide there. */}
      <text visible={!props.header.filtering} fg={props.header.fg} flexGrow={props.header.note === null ? 1 : 0}>
        {props.header.text}
      </text>
      {/*
       * The outsized shrink makes the note give up its columns before the
       * label loses any, so a narrow panel cuts the note and keeps the label.
       */}
      <box
        visible={!props.header.filtering && props.header.note !== null}
        flexGrow={1}
        flexShrink={1000}
        minWidth={0}
        overflow="hidden"
      >
        <text fg={props.header.noteFg} wrapMode="none">
          {props.header.note ? `  ${props.header.note}` : ""}
        </text>
      </box>
      <box visible={props.header.filtering} flexDirection="row" flexGrow={1}>
        <text fg={colors.secondary}>/</text>
        {props.field}
      </box>
    </box>
  )
}

/**
 * An edge row's "↑ N" or "↓ N more", drawn over the row beneath it rather
 * than beside the list, so it costs no column and shows only while rows hide.
 */
function OverflowHint(props: { text: string | null; edge: "top" | "bottom" }) {
  return (
    <Show when={props.text}>
      {(text: () => string) => (
        <box
          position="absolute"
          top={props.edge === "top" ? 0 : undefined}
          bottom={props.edge === "bottom" ? 0 : undefined}
          left={0}
          right={0}
          height={1}
          paddingLeft={1}
          backgroundColor={theme.mantle}
        >
          <text fg={theme.overlay0}>{text()}</text>
        </box>
      )}
    </Show>
  )
}

/** The file tree panel: a header row over every visible row in a scrollbox. */
export function FileTreeView(props: {
  model: FileTreeViewModel
  field: InputRenderable
  scrollRef?: (scroll: ScrollBoxRenderable) => void
}) {
  return (
    <box flexDirection="column" backgroundColor={theme.mantle} paddingX={1} height="100%">
      <Header header={props.model.header} field={props.field} />
      <box flexGrow={1} width="100%" position="relative">
        <scrollbox
          ref={props.scrollRef}
          id="file-tree-scroll"
          flexGrow={1}
          width="100%"
          scrollY
          verticalScrollbarOptions={{ visible: false }}
        >
          <box flexDirection="column" width="100%">
            <For each={props.model.rows}>
              {(row) => (
                <box height={1} width="100%" flexDirection="row" backgroundColor={row.bg ?? undefined}>
                  <text fg={row.marker.fg}>{row.marker.text}</text>
                  <text fg={row.status.fg}>{row.status.text}</text>
                  <text fg={row.name.fg}>{row.name.text}</text>
                </box>
              )}
            </For>
            <Show when={props.model.empty}>
              {(empty: () => string) => (
                <box height={1} width="100%" paddingLeft={1}>
                  <text fg={theme.overlay0}>{empty()}</text>
                </box>
              )}
            </Show>
            <Show when={props.model.hidden}>
              {(hidden: () => string) => (
                <box height={1} width="100%" paddingLeft={1}>
                  <text fg={colors.textMuted}>{hidden()}</text>
                </box>
              )}
            </Show>
          </box>
        </scrollbox>
        <OverflowHint text={props.model.overflow.above} edge="top" />
        <OverflowHint text={props.model.overflow.below} edge="bottom" />
      </box>
    </box>
  )
}
