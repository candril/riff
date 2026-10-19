import type { CliRenderer, Renderable } from "@opentui/core"
import { batch } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { PRInfoConversationView } from "../components/PRInfoConversationView"
import type { PanelMarkdownStyle } from "../components/PanelMarkdown"
import type { ConversationRows } from "../components/pr-info-conversation-rows"
import { softenCommentHtml } from "../utils/comment-html"
import { withReferences } from "../components/with-references"
import { mountSolid } from "./solid-island"

// A fresh object per island: a store wraps the object it is given, and two
// stores built on one shared constant would write through to each other.
const empty = (): ConversationRows => ({ rows: [], note: null })

/**
 * The bodies as they are drawn. Resolved references land in a cache outside
 * any signal, so they are read here, on every push, where a body that has
 * since gained a title differs from the one in the store and is redrawn.
 */
function asDrawn(model: ConversationRows): ConversationRows {
  return {
    ...model,
    rows: model.rows.map((row) =>
      row.kind === "item"
        ? {
            ...row,
            body: row.body.map((part) =>
              part.kind === "markdown" ? { ...part, text: withReferences(softenCommentHtml(part.text)) } : part
            ),
          }
        : row
    ),
  }
}

/**
 * The PR info panel's conversation as a long-lived island, like the list
 * sections. Rows and their body parts are matched by key, so a push that
 * moves the cursor or a label restyles what is drawn, and a markdown body
 * whose text did not change keeps its renderable and its layout.
 */
export function createPrInfoConversationIsland(
  renderer: CliRenderer,
  { id, markdown }: { id?: string; markdown: PanelMarkdownStyle }
) {
  const [state, setState] = createStore({ model: empty() })
  const headers = new Map<string, Renderable>()
  const island = mountSolid(
    renderer,
    () => (
      <PRInfoConversationView
        model={state.model}
        markdown={markdown}
        onRow={(key, header) => headers.set(key, header)}
      />
    ),
    { ...(id ? { id } : {}), flexDirection: "column" }
  )

  return {
    host: island.host,
    update(model: ConversationRows) {
      batch(() => setState("model", reconcile(asDrawn(model), { key: "key" })))
      const keys = new Set(model.rows.map((row) => row.key))
      for (const key of headers.keys()) if (!keys.has(key)) headers.delete(key)
    },
    /**
     * The drawn header of the row at `index`: an item's one-row header, or
     * the reviewers' whole block. The body boxes between rows are skipped.
     */
    rowAt(index: number): Renderable | undefined {
      const key = state.model.rows[index]?.key
      return key === undefined ? undefined : headers.get(key)
    },
    dispose() {
      island.dispose()
    },
  }
}

export type PrInfoConversationIsland = ReturnType<typeof createPrInfoConversationIsland>
