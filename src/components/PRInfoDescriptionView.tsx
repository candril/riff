import { RGBA } from "@opentui/core"
import { For, Show } from "solid-js"
import { theme } from "../theme"
import { PanelMarkdown, Pills, type PanelMarkdownStyle } from "./PanelMarkdown"
import type { DescriptionModel } from "./pr-info-description"

/** The description's cursor row: the background every other selected row has. */
export const DESCRIPTION_CURSOR_BG = RGBA.fromHex(theme.surface1)

type Body = NonNullable<DescriptionModel["body"]>

/**
 * The PR info panel's description: its markdown, the pictures it carried by
 * name, its reactions, and the cursor row under the line the cursor is on.
 * `height` is what the description measures, laid out.
 */
export function PRInfoDescriptionView(props: {
  model: DescriptionModel
  bodyId: string
  markdown: PanelMarkdownStyle
  height: number
}) {
  /**
   * The line the cursor row is drawn under. A description that only laid
   * out after the cursor was put in it (a refresh) may be shorter than the
   * row it names, so the last line stands in for it.
   */
  const line = () => Math.min(props.model.cursorLine ?? -1, props.height - 1)
  return (
    <>
      {/* First, so the text after it draws over it and keeps its colours:
          paint hooks cannot read the cells a highlight would have to repaint. */}
      <box
        position="absolute"
        left={0}
        top={Math.max(0, line())}
        width="100%"
        height={1}
        backgroundColor={DESCRIPTION_CURSOR_BG}
        visible={props.model.cursorLine !== null && line() >= 0}
      />
      <Show when={props.model.body} fallback={<text fg={theme.overlay0}>No description provided</text>}>
        {(body: () => Body) => (
          <>
            <Show when={body().text}>
              <PanelMarkdown id={props.bodyId} text={body().text} style={props.markdown} />
            </Show>
            {/* Named rather than drawn: the panel cannot draw them, and the
                section's Enter opens the PR on github.com, where they can be looked at. */}
            <For each={body().images}>{(label) => <text fg={theme.sapphire}>{`▣ ${label}`}</text>}</For>
          </>
        )}
      </Show>
      <Show when={props.model.reactions.length > 0}>
        <Pills indent={0} pills={props.model.reactions} />
      </Show>
    </>
  )
}
