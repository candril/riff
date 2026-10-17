import type { CliRenderer } from "@opentui/core"
import { Show } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { Peek } from "../components/Peek"
import type { PeekModel } from "../components/peek-model"
import { mountSolid } from "./solid-island"

/**
 * A peek as a long-lived island, like the confirm dialog: gl's peeks share
 * one, c's hunk peek has its own. The host carries the full-screen
 * placement, since an absolute child of a static host would be placed
 * against the host rather than the screen.
 */
export function createPeekIsland(renderer: CliRenderer, { id, zIndex }: { id: string; zIndex?: number }) {
  const [state, setState] = createStore<{ model: PeekModel | null }>({ model: null })
  const island = mountSolid(
    renderer,
    () => (
      <Show when={state.model}>
        {(model: () => PeekModel) => (
          <>
            <box position="absolute" top={0} left={0} width="100%" height="100%" backgroundColor="#00000080" />
            <Peek model={model()} />
          </>
        )}
      </Show>
    ),
    {
      id,
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      ...(zIndex !== undefined ? { zIndex } : {}),
      justifyContent: "center",
      alignItems: "center",
    }
  )
  return {
    host: island.host,
    update(next: PeekModel | null) {
      setState("model", reconcile(next))
    },
    dispose: island.dispose,
  }
}

export type PeekIsland = ReturnType<typeof createPeekIsland>
