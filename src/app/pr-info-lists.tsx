import { BoxRenderable, type CliRenderer, type Renderable } from "@opentui/core"
import { batch } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { PRInfoListView } from "../components/PRInfoListView"
import type { ListRows } from "../components/pr-info-list-rows"
import { mountSolid } from "./solid-island"

// A fresh object per island: a store wraps the object it is given, and two
// stores built on one shared constant would write through to each other.
const empty = (): ListRows => ({ rows: [], note: null })

/**
 * One list section of the PR info panel as a long-lived island. The panel
 * discards its section boxes on every rebuild; the host is kept alive, so
 * it is only unmounted there and mounted again into the new box, and a
 * push restyles the rows that changed instead of building them anew.
 */
export function createPrInfoListIsland(renderer: CliRenderer, { id }: { id?: string } = {}) {
  const [state, setState] = createStore({ model: empty() })
  const island = mountSolid(renderer, () => <PRInfoListView model={state.model} />, {
    ...(id ? { id } : {}),
    flexDirection: "column",
  })

  return {
    host: island.host,
    update(model: ListRows) {
      batch(() => setState("model", reconcile(model, { key: "key" })))
    },
    /** The drawn row at `index`; the note under the rows is not one. */
    rowAt(index: number): Renderable | undefined {
      return island.host.getChildren().filter((child) => child instanceof BoxRenderable)[index]
    },
    dispose() {
      island.dispose()
    },
  }
}

export type PrInfoListIsland = ReturnType<typeof createPrInfoListIsland>
