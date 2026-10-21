import type { CliRenderer } from "@opentui/core"
import { Show } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { Toast } from "../components/Toast"
import type { ToastModel } from "../components/notification-model"
import { mountSolid } from "./solid-island"

/**
 * The toast as a long-lived island: its frame follower hands it a fresh model on
 * every frame, and `reconcile` turns that into updates of only what changed. The host
 * is the absolutely placed box, since an absolute child of a static host would
 * be placed against the host rather than the screen.
 */
export function createToastIsland(renderer: CliRenderer) {
  const [state, setState] = createStore<{ model: ToastModel | null }>({ model: null })
  const island = mountSolid(
    renderer,
    () => <Show when={state.model}>{(model: () => ToastModel) => <Toast model={model()} />}</Show>,
    { id: "toast-container", position: "absolute", top: 1, right: 2, zIndex: 100 }
  )
  return {
    host: island.host,
    update(next: ToastModel | null) {
      setState("model", reconcile(next))
    },
    dispose: island.dispose,
  }
}

export type ToastIsland = ReturnType<typeof createToastIsland>
