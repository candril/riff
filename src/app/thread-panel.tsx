import type { BoxRenderable, CliRenderer } from "@opentui/core"
import { batch } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { ThreadPanelView } from "../components/ThreadPanelView"
import { threadPanelMarkdown } from "../components/thread-panel-markdown"
import { PANEL_PADDING_X } from "../components/thread-rows-estimate"
import { threadPanelModel, type ThreadPanelInput, type ThreadPanelModel } from "../components/thread-panel-model"
import { withReferences } from "../components/with-references"
import type { ThreadPanelLayout } from "../features/inline-comment-overlay/motions"
import { colors, theme } from "../theme"
import { softenCommentHtml } from "../utils/comment-html"
import { createIslandComposer } from "./island-composer"
import { createIslandPrompt } from "./island-prompt"
import { mountSolid } from "./solid-island"

// A fresh object per island: a store wraps the object it is given, and two
// stores built on one shared constant would write through to each other.
const empty = (): ThreadPanelModel => ({
  header: { label: "", filterText: null, filterInput: false, note: null, noteFg: colors.secondary, right: null, labelFg: colors.textMuted, rightFg: theme.overlay0 },
  window: { before: 0, after: 0 },
  threads: [],
  threadSizes: [],
  empty: true,
  emptyText: "",
  composer: null,
  picker: null,
  hints: null,
})

/**
 * The renderer has no case for HTML tokens, so the tags people write in
 * GitHub comments would land in a body verbatim. A bare `#412` gets the
 * title of what it points at, once riff has been told (spec 059).
 */
function withBodiesAsDrawn(model: ThreadPanelModel): ThreadPanelModel {
  return {
    ...model,
    threads: model.threads.map((thread) => ({
      ...thread,
      comments: thread.comments.map((comment) => ({
        ...comment,
        bodyText: comment.bodyText && withReferences(softenCommentHtml(comment.bodyText)),
      })),
    })),
  }
}

/**
 * The thread panel as a long-lived island, docked beside the diff, that
 * follows the frame. Every frame builds the model from scratch; the keyed
 * reconcile only restyles the rows that changed, so a comment's body is
 * built once and kept for as long as the comment is drawn. Closing hides
 * the host rather than unmounting the view.
 */
export function createThreadPanelIsland(renderer: CliRenderer) {
  const [state, setState] = createStore({ model: empty() })
  const prompt = createIslandPrompt("comments-filter")
  const composer = createIslandComposer()
  const markdown = threadPanelMarkdown(renderer)
  let viewport: BoxRenderable | undefined

  const island = mountSolid(
    renderer,
    () => {
      const field = prompt.createField()
      const composerField = composer.createField()
      return (
        <ThreadPanelView
          model={state.model}
          field={field}
          composer={composerField}
          markdown={markdown}
          viewportRef={(ref) => (viewport = ref)}
        />
      )
    },
    {
      id: "thread-panel",
      // A column of the content row (app/shell.tsx), narrowed only where it and the tree overflow the screen.
      flexShrink: 1,
      height: "100%",
      flexDirection: "column",
      // Mantle against the diff's base is what sets the panel apart.
      backgroundColor: theme.mantle,
      paddingX: PANEL_PADDING_X,
      overflow: "hidden",
      visible: false,
    }
  )

  return {
    host: island.host,
    update(input: (ThreadPanelInput & { now: number }) | null) {
      if (input) {
        island.host.width = input.width
        // OpenTUI turns shrinking off on any box handed a fixed width after
        // it is built, and the panel must still give way to the tree.
        island.host.flexShrink = 1
        const model = withBodiesAsDrawn(threadPanelModel(input))
        batch(() => setState("model", reconcile(model, { key: "key" })))
      }
      island.host.visible = input !== null
    },
    prompt: prompt.prompt,
    field: prompt.field,
    compose: composer.compose,
    composer: composer.handle,
    /**
     * Where each mounted entry was last laid out. The stack is flat, each
     * thread's header and then its comments, and only a collapsed thread's
     * header is an entry of its own.
     */
    layout(): ThreadPanelLayout | null {
      const stack = viewport?.getChildren()[0]
      if (!viewport || !stack || viewport.isDestroyed) return null
      const children = stack.getChildren()
      const tops = new Map<string, number>()
      let at = 0
      for (const thread of state.model.threads) {
        const header = children[at++]
        if (header && thread.header.caret !== null) tops.set(thread.key, header.y)
        for (const comment of thread.comments) {
          const row = children[at++]
          if (row) tops.set(comment.key, row.y)
        }
      }
      // The viewport's padding rows carry the edge hints, so they are not page.
      return { viewportRows: Math.max(0, viewport.height - 2), tops, bottom: stack.y + stack.height }
    },
    dispose() {
      island.dispose()
    },
  }
}

export type ThreadPanelIsland = ReturnType<typeof createThreadPanelIsland>
