import type { CliRenderer } from "@opentui/core"
import { batch } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { FeedView } from "../components/FeedView"
import type { FeedModel } from "../components/feed-model"
import { createIslandPrompt } from "./island-prompt"
import { mountSolid } from "./solid-island"

// A fresh object per island: a store wraps the object it is given, and two
// stores built on one shared constant would write through to each other.
const hidden = (): FeedModel => ({
  header: { countText: "", scope: "", loadingSuffix: "", unseenCount: 0 },
  legend: { toggles: [], filter: "", narrowed: false, filterInput: false },
  empty: null,
  rows: [],
})

/**
 * The activity feed as a long-lived island: it follows the frame, which
 * builds a fresh model on every pass, and the keyed reconcile turns that into updates of only the
 * rows that changed. The host carries the old view's own padding.
 */
export function createFeedIsland(renderer: CliRenderer) {
  const prompt = createIslandPrompt("feed-filter")
  const [state, setState] = createStore({ shown: false, model: hidden() })
  const island = mountSolid(
    renderer,
    () => {
      const field = prompt.createField()
      return (
        <box visible={state.shown} width="100%" height="100%" flexDirection="column">
          <FeedView model={state.model} field={field} />
        </box>
      )
    },
    {
      id: "feed-view",
      width: "100%",
      height: "100%",
      flexDirection: "column",
      paddingTop: 1,
      paddingLeft: 2,
      paddingRight: 2,
    }
  )
  return {
    host: island.host,
    update(next: FeedModel | null) {
      batch(() => {
        setState("shown", next !== null)
        if (next) setState("model", reconcile(next, { key: "key" }))
      })
    },
    prompt: prompt.prompt,
    field: prompt.field,
    dispose: island.dispose,
  }
}

export type FeedIsland = ReturnType<typeof createFeedIsland>
