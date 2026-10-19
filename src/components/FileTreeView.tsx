import { For, Show } from "solid-js"
import type { InputRenderable, ScrollBoxRenderable } from "@opentui/core"
import { colors, theme } from "../theme"
import type { FileTreeModel } from "./file-tree-model"

/**
 * What the view draws. The flat items stay out: they carry the tree's nodes,
 * which a keyed reconcile would walk on every pass for nothing drawn.
 */
export type FileTreeViewModel = Omit<FileTreeModel, "items">

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
      <text visible={!props.header.filtering} fg={props.header.fg} flexGrow={1}>
        {props.header.text}
      </text>
      <box visible={props.header.filtering} flexDirection="row" flexGrow={1}>
        <text fg={colors.secondary}>/</text>
        {props.field}
      </box>
    </box>
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
      <scrollbox
        ref={props.scrollRef}
        id="file-tree-scroll"
        flexGrow={1}
        width="100%"
        scrollY
        verticalScrollbarOptions={{
          showArrows: false,
          trackOptions: { backgroundColor: theme.surface0, foregroundColor: theme.surface2 },
        }}
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
          <Show when={props.model.hidden}>
            {(hidden: () => string) => (
              <box height={1} width="100%" paddingLeft={1}>
                <text fg={colors.textMuted}>{hidden()}</text>
              </box>
            )}
          </Show>
        </box>
      </scrollbox>
    </box>
  )
}
