import type { BoxRenderable, InputRenderable, Renderable, ScrollBoxRenderable } from "@opentui/core"
import type { JSX } from "@opentui/solid"
import { For, Match, Show, Switch } from "solid-js"
import type { PRInfoPanelSection } from "../state"
import { colors, theme } from "../theme"
import type { PanelMarkdownStyle } from "./PanelMarkdown"
import { PRCommentPrompt } from "./PRCommentPromptView"
import { PRInfoConversationView } from "./PRInfoConversationView"
import { PRInfoDescriptionView } from "./PRInfoDescriptionView"
import { PRInfoMeta, PRInfoSectionHeader } from "./PRInfoHeaderViews"
import { PRInfoListView } from "./PRInfoListView"
import type { PrCommentPromptModel } from "./pr-comment-prompt"
import type { PanelMeta, StackLine } from "./pr-info-header"
import type { PanelSection, SectionBody } from "./pr-info-panel-model"

/** What the PR info panel draws. A folded section keeps the body it had when it was last open. */
export interface PanelState {
  meta: PanelMeta
  stack: StackLine
  sections: PanelSection[]
  filterOpen: boolean
  prompt: PrCommentPromptModel
  promptOpen: boolean
}

/** The renderables the panel measures, scrolls and types into. */
export interface PanelRefs {
  scroll(box: ScrollBoxRenderable): void
  filter(input: InputRenderable): void
  header(section: PRInfoPanelSection, box: BoxRenderable): void
  list(section: PRInfoPanelSection, box: BoxRenderable): void
  description(box: BoxRenderable): void
  conversationRow(key: string, header: Renderable): void
}

export interface PanelViewProps {
  state: PanelState
  refs: PanelRefs
  markdown: PanelMarkdownStyle
  descriptionHeight: number
  onDescriptionSize(): void
  onFilterInput(value: string): void
  /** Runs before the scroll box paints, once layout has placed what the last push changed. */
  beforeScrollRender(): void
}

type Body<K extends SectionBody["kind"]> = Extract<SectionBody, { kind: K }>

/** The children of the panel's own box: the `Ctrl-f` row, the scrolled sections and the `gC` prompt over them. */
export function PRInfoPanelView(props: PanelViewProps) {
  return (
    <>
      {/* A real input widget, so word deletion, paste and the rest come from OpenTUI (spec 065). */}
      <box id="pr-info-filter-row" height={1} width="100%" flexDirection="row" paddingLeft={2} visible={props.state.filterOpen}>
        <text fg={colors.secondary}>/</text>
        <input
          ref={props.refs.filter}
          id="pr-info-filter"
          placeholder="filter rows…"
          placeholderColor={theme.overlay0}
          backgroundColor={theme.base}
          textColor={theme.text}
          focusedBackgroundColor={theme.base}
          focusedTextColor={theme.text}
          cursorColor={theme.yellow}
          flexGrow={1}
          onInput={props.onFilterInput}
        />
      </box>
      <scrollbox
        ref={props.refs.scroll}
        id="pr-info-scroll"
        flexGrow={1}
        width="100%"
        paddingLeft={2}
        paddingRight={2}
        paddingTop={1}
        scrollY
        renderBefore={() => props.beforeScrollRender()}
      >
        <box flexDirection="column" width="100%">
          {/* What the header line does not already say (spec 067), and what this PR is stacked on. */}
          <box id="pr-info-meta" flexDirection="column">
            <PRInfoMeta meta={props.state.meta} stack={props.state.stack} />
          </box>
          <box height={1} width="100%" marginTop={1}>
            <text fg={theme.surface1}>{"─".repeat(70)}</text>
          </box>
          <box flexDirection="column" width="100%">
            <For each={props.state.sections}>{(section) => <Section section={section} {...props} />}</For>
          </box>
        </box>
      </scrollbox>
      <box
        id="pr-comment-input-overlay"
        position="absolute"
        top={0}
        left={0}
        width="100%"
        height="100%"
        zIndex={100}
        justifyContent="center"
        alignItems="center"
        visible={props.state.promptOpen}
      >
        <PRCommentPrompt model={props.state.prompt} />
      </box>
    </>
  )
}

/**
 * A body is built the first time its section opens and only hidden while it
 * is folded, so a markdown body is not highlighted and laid out again on
 * every reopen.
 */
function Section(props: PanelViewProps & { section: PanelSection }) {
  const key = props.section.key
  return (
    <box id={`section-${key}`} flexDirection="column" width="100%" marginTop={1}>
      <box ref={(box) => props.refs.header(key, box)} id={`pr-info-header-${key}`} flexDirection="column">
        <PRInfoSectionHeader row={props.section.header} />
      </box>
      <Show when={props.section.body}>
        {(body: () => SectionBody) => (
          <Switch>
            <Match when={body().kind === "description" && body()}>
              {(description: () => Body<"description">) => (
                // The cursor row spans this box's padding, so the box is the description's own.
                <box
                  ref={props.refs.description}
                  flexDirection="column"
                  width="100%"
                  paddingLeft={2}
                  marginTop={1}
                  visible={props.section.expanded}
                  onSizeChange={() => props.onDescriptionSize()}
                >
                  <PRInfoDescriptionView
                    model={description().model}
                    bodyId="pr-info-description"
                    markdown={props.markdown}
                    height={props.descriptionHeight}
                  />
                </box>
              )}
            </Match>
            <Match when={body().kind === "list" && body()}>
              {(list: () => Body<"list">) => (
                <Indented visible={props.section.expanded}>
                  <box ref={(box) => props.refs.list(key, box)} id={`pr-info-${key}`} flexDirection="column">
                    <PRInfoListView model={list().rows} />
                  </box>
                </Indented>
              )}
            </Match>
            <Match when={body().kind === "conversation" && body()}>
              {(conversation: () => Body<"conversation">) => (
                <Indented visible={props.section.expanded}>
                  <box id="pr-info-conversation" flexDirection="column">
                    <PRInfoConversationView
                      model={conversation().rows}
                      markdown={props.markdown}
                      onRow={props.refs.conversationRow}
                    />
                  </box>
                </Indented>
              )}
            </Match>
          </Switch>
        )}
      </Show>
    </box>
  )
}

function Indented(props: { visible: boolean; children: JSX.Element }) {
  return (
    <box flexDirection="column" width="100%" paddingLeft={2} marginTop={1} visible={props.visible}>
      {props.children}
    </box>
  )
}
