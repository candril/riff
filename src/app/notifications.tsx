import type { CliRenderer } from "@opentui/core"
import { Show } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { Toast } from "../components/Toast"
import { DraftNotification } from "../components/DraftNotification"
import type { DraftNotificationModel, ToastModel } from "../components/notification-model"
import { mountSolid } from "./solid-island"

/**
 * The toast as a long-lived island: render.ts hands it a fresh model on every
 * pass, and `reconcile` turns that into updates of only what changed. The host
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

/** Claude's draft notice, the same way, pinned bottom-right. */
export function createDraftNotificationIsland(renderer: CliRenderer) {
  const [state, setState] = createStore<{ model: DraftNotificationModel | null }>({ model: null })
  const island = mountSolid(
    renderer,
    () => (
      <Show when={state.model}>
        {(model: () => DraftNotificationModel) => <DraftNotification model={model()} />}
      </Show>
    ),
    { id: "draft-notification", position: "absolute", bottom: 2, right: 2, zIndex: 100 }
  )
  return {
    host: island.host,
    update(next: DraftNotificationModel | null) {
      setState("model", reconcile(next))
    },
    dispose: island.dispose,
  }
}

export type ToastIsland = ReturnType<typeof createToastIsland>
export type DraftNotificationIsland = ReturnType<typeof createDraftNotificationIsland>
