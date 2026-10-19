import type { CliRenderer } from "@opentui/core"
import { batch, createSignal } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { PRInfoDescriptionView } from "../components/PRInfoDescriptionView"
import type { PanelMarkdownStyle } from "../components/PanelMarkdown"
import type { DescriptionModel } from "../components/pr-info-description"
import { softenCommentHtml } from "../utils/comment-html"
import { withReferences } from "../components/with-references"
import { mountSolid } from "./solid-island"

// A fresh object per island: a store wraps the object it is given, and two
// stores built on one shared constant would write through to each other.
const empty = (): DescriptionModel => ({ body: null, reactions: [], cursorLine: null })

/**
 * The text as drawn. Resolved references land in a cache outside any
 * signal, so they are read here, on every push, where a body that has since
 * gained a title differs from the one in the store and is redrawn.
 */
function asDrawn(model: DescriptionModel): DescriptionModel {
  return model.body ? { ...model, body: { ...model.body, text: withReferences(softenCommentHtml(model.body.text)) } } : model
}

/**
 * The PR info panel's description as a long-lived island, like the other
 * sections. A push that only moves the cursor moves the cursor row, and the
 * markdown body keeps its renderable and its layout across every push.
 *
 * `id` is the markdown body's. The host is the section's content box, its
 * padding included, so the cursor row spans what it always has.
 */
export function createPrInfoDescriptionIsland(
  renderer: CliRenderer,
  { id, markdown }: { id: string; markdown: PanelMarkdownStyle }
) {
  const [state, setState] = createStore({ model: empty() })
  const [height, setHeight] = createSignal(0)
  const island = mountSolid(
    renderer,
    () => <PRInfoDescriptionView model={state.model} bodyId={id} markdown={markdown} height={height()} />,
    { flexDirection: "column", width: "100%", paddingLeft: 2, marginTop: 1 }
  )
  island.host.onSizeChange = () => setHeight(island.host.height)

  return {
    host: island.host,
    update(model: DescriptionModel) {
      batch(() => setState("model", reconcile(asDrawn(model))))
    },
    dispose() {
      island.dispose()
    },
  }
}

export type PrInfoDescriptionIsland = ReturnType<typeof createPrInfoDescriptionIsland>
