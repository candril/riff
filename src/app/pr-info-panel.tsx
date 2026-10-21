import { BoxRenderable, type CliRenderer, type InputRenderable, type Renderable, type ScrollBoxRenderable } from "@opentui/core"
import { batch, createSignal } from "solid-js"
import { createStore, reconcile, unwrap } from "solid-js/store"
import type { PanelMarkdownStyle } from "../components/PanelMarkdown"
import { PRInfoPanelView, type PanelState } from "../components/PRInfoPanelView"
import type { PrCommentPromptModel } from "../components/pr-comment-prompt"
import type { PanelMeta, StackLine } from "../components/pr-info-header"
import type { PanelSection, SectionBody } from "../components/pr-info-panel-model"
import type { PRInfoPanelSection } from "../state"
import { theme } from "../theme"
import { softenCommentHtml } from "../utils/comment-html"
import { withReferences } from "../components/with-references"
import { mountSolid } from "./solid-island"

/** What a push may change; a key left out keeps what the panel shows. */
export interface PrInfoPanelModel {
  meta?: { meta: PanelMeta; stack: StackLine }
  sections?: PanelSection[]
  filterOpen?: boolean
  /** Null while the `gC` prompt is closed. */
  prompt?: PrCommentPromptModel | null
}

// A fresh object per island: a store wraps the object it is given, and two
// stores built on one shared constant would write through to each other.
const emptyState = (): PanelState => ({
  meta: { author: "", branches: "", approvers: [] },
  stack: { text: "", fg: theme.subtext0, visible: true },
  sections: [],
  filterOpen: false,
  prompt: { text: "", textFg: theme.overlay0, status: "", statusFg: theme.overlay0 },
  promptOpen: false,
})

/**
 * Bodies as drawn. Resolved references land in a cache outside any signal,
 * so they are read here, on every push, where a body that has since gained
 * a title differs from the one in the store and is redrawn.
 */
function asDrawn(body: SectionBody): SectionBody {
  const drawn = (text: string) => withReferences(softenCommentHtml(text))
  switch (body.kind) {
    case "description":
      return body.model.body ? { ...body, model: { ...body.model, body: { ...body.model.body, text: drawn(body.model.body.text) } } } : body
    case "conversation":
      return {
        ...body,
        rows: {
          ...body.rows,
          rows: body.rows.rows.map((row) =>
            row.kind === "item"
              ? { ...row, body: row.body.map((part) => (part.kind === "markdown" ? { ...part, text: drawn(part.text) } : part)) }
              : row
          ),
        },
      }
    case "list":
      return body
  }
}

export interface PrInfoPanelIslandOptions {
  markdown: PanelMarkdownStyle
  onFilterInput(value: string): void
  beforeScrollRender(): void
  onDescriptionResize(): void
}

/**
 * The whole PR info panel as one island. The host is the panel's own box;
 * a push reconciles the sections by key and their rows by the rows' keys,
 * so a cursor move restyles the rows it touches and nothing is rebuilt.
 */
export function createPrInfoPanelIsland(renderer: CliRenderer, opts: PrInfoPanelIslandOptions) {
  const [state, setState] = createStore(emptyState())
  const [descriptionHeight, setDescriptionHeight] = createSignal(0)
  let scrollBox!: ScrollBoxRenderable
  let filterInput!: InputRenderable
  let descriptionBox: BoxRenderable | null = null
  const headers = new Map<PRInfoPanelSection, BoxRenderable>()
  const lists = new Map<PRInfoPanelSection, BoxRenderable>()
  const conversationRows = new Map<string, Renderable>()

  const island = mountSolid(
    renderer,
    () => (
      <PRInfoPanelView
        state={state}
        refs={{
          scroll: (box) => (scrollBox = box),
          filter: (input) => (filterInput = input),
          header: (key, box) => headers.set(key, box),
          list: (key, box) => lists.set(key, box),
          description: (box) => (descriptionBox = box),
          conversationRow: (key, header) => conversationRows.set(key, header),
        }}
        markdown={opts.markdown}
        descriptionHeight={descriptionHeight()}
        onDescriptionSize={() => {
          setDescriptionHeight(descriptionBox?.height ?? 0)
          opts.onDescriptionResize()
        }}
        onFilterInput={opts.onFilterInput}
        beforeScrollRender={opts.beforeScrollRender}
      />
    ),
    { id: "pr-info-panel", flexGrow: 1, height: "100%", flexDirection: "column", backgroundColor: theme.base }
  )

  /** A folded section keeps the body it last drew, so the views under it stay mounted. */
  function withKeptBodies(sections: PanelSection[]): PanelSection[] {
    return sections.map((section) => {
      if (section.body) return { ...section, body: asDrawn(section.body) }
      const kept = state.sections.find((drawn) => drawn.key === section.key)?.body
      return { ...section, body: kept ? unwrap(kept) : null }
    })
  }

  function conversationKeys(): Set<string> {
    const body = state.sections.find((section) => section.key === "conversation")?.body
    return new Set(body?.kind === "conversation" ? body.rows.rows.map((row) => row.key) : [])
  }

  return {
    host: island.host,
    scrollBox,
    filterInput,
    update(model: PrInfoPanelModel) {
      batch(() => {
        if (model.sections) setState("sections", reconcile(withKeptBodies(model.sections), { key: "key" }))
        if (model.meta) setState("meta", reconcile(model.meta.meta))
        if (model.meta) setState("stack", reconcile(model.meta.stack))
        if (model.filterOpen !== undefined) setState("filterOpen", model.filterOpen)
        if (model.prompt) setState("prompt", reconcile(model.prompt))
        if (model.prompt !== undefined) setState("promptOpen", model.prompt !== null)
      })
      if (model.sections) {
        const keys = conversationKeys()
        for (const key of conversationRows.keys()) if (!keys.has(key)) conversationRows.delete(key)
      }
    },
    /** The section's header row, where the cursor is while it is on the header. */
    headerOf(section: PRInfoPanelSection): BoxRenderable | undefined {
      return headers.get(section)
    },
    /** The description's box, padding included; its laid-out height is how many rows the cursor has. */
    descriptionBox(): BoxRenderable | null {
      return descriptionBox
    },
    /**
     * The drawn row at `index` of a list section (the note under the rows
     * is none), or the drawn header of a conversation row: an item's
     * one-row header, or the reviewers' whole block.
     */
    rowAt(section: PRInfoPanelSection, index: number): Renderable | undefined {
      if (section === "conversation") {
        const body = state.sections.find((drawn) => drawn.key === section)?.body
        const key = body?.kind === "conversation" ? body.rows.rows[index]?.key : undefined
        return key === undefined ? undefined : conversationRows.get(key)
      }
      return lists.get(section)?.getChildren().filter((child) => child instanceof BoxRenderable)[index]
    },
    dispose() {
      island.host.parent?.remove(island.host)
      island.dispose()
    },
  }
}

export type PrInfoPanelIsland = ReturnType<typeof createPrInfoPanelIsland>
