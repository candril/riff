import type { CliRenderer } from "@opentui/core"
import { Show } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { SearchPrompt } from "../components/SearchPrompt"
import { FlashPrompt } from "../components/FlashPrompt"
import { PromptInput } from "../components/PromptInput"
import type { FlashPromptModel, SearchPromptModel } from "../components/prompt-line-model"
import { mountSolid } from "./solid-island"

const NO_SEARCH: SearchPromptModel = { prefix: "/", typing: false, pattern: "", tone: "normal", loading: false, error: null }

/**
 * The search row as a long-lived island: render.ts hands it a fresh model on
 * every pass, and `reconcile` turns that into updates of only what changed.
 */
export function createSearchPromptIsland(renderer: CliRenderer) {
  const field = PromptInput(renderer, "search")
  const [state, setState] = createStore({ shown: false, model: NO_SEARCH })
  // Hidden rather than unmounted when there is no search: unmounting the row
  // would take PromptInput's field down with it.
  const island = mountSolid(
    renderer,
    () => (
      <box visible={state.shown} width="100%">
        <SearchPrompt model={state.model} field={field} />
      </box>
    ),
    { height: 1, width: "100%" }
  )
  return {
    host: island.host,
    update(next: SearchPromptModel | null) {
      setState("shown", next !== null)
      if (next) setState("model", reconcile(next))
    },
    dispose: island.dispose,
  }
}

/** Flash's row, the same way. */
export function createFlashPromptIsland(renderer: CliRenderer) {
  const [state, setState] = createStore<{ model: FlashPromptModel | null }>({ model: null })
  const island = mountSolid(
    renderer,
    () => <Show when={state.model}>{(model: () => FlashPromptModel) => <FlashPrompt model={model()} />}</Show>,
    { height: 1, width: "100%" }
  )
  return {
    host: island.host,
    update(next: FlashPromptModel | null) {
      setState("model", reconcile(next))
    },
    dispose: island.dispose,
  }
}

export type SearchPromptIsland = ReturnType<typeof createSearchPromptIsland>
export type FlashPromptIsland = ReturnType<typeof createFlashPromptIsland>
