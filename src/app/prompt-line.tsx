import type { CliRenderer } from "@opentui/core"
import { Show } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { SearchPrompt } from "../components/SearchPrompt"
import { FlashPrompt } from "../components/FlashPrompt"
import type { FlashPromptModel, SearchPromptModel } from "../components/prompt-line-model"
import { createIslandPrompt } from "./island-prompt"
import { mountSolid } from "./solid-island"

// A fresh object per island: a store wraps the object it is given, and
// reconcile writes through into it, so a shared constant would let one
// island's search show up in another's.
const noSearch = (): SearchPromptModel => ({
  prefix: "/",
  typing: false,
  pattern: "",
  tone: "normal",
  loading: false,
  error: null,
})

/**
 * The search row as a long-lived island: it draws a fresh model from
 * every frame, and `reconcile` turns that into updates of only what changed.
 */
export function createSearchPromptIsland(renderer: CliRenderer) {
  const prompt = createIslandPrompt("search")
  const [state, setState] = createStore({ shown: false, model: noSearch() })
  // Hidden rather than unmounted when there is no search: unmounting the row
  // would take the island's field down with it.
  const island = mountSolid(
    renderer,
    () => {
      const field = prompt.createField()
      return (
        <box visible={state.shown} width="100%">
          <SearchPrompt model={state.model} field={field} />
        </box>
      )
    },
    { height: 1, width: "100%" }
  )
  return {
    host: island.host,
    update(next: SearchPromptModel | null) {
      setState("shown", next !== null)
      if (next) setState("model", reconcile(next))
    },
    prompt: prompt.prompt,
    field: prompt.field,
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
