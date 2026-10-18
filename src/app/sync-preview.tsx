import type { CliRenderer } from "@opentui/core"
import { Show } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { SyncPreview } from "../components/SyncPreview"
import type { SyncPreviewModel } from "../components/sync-preview-model"
import { mountSolid } from "./solid-island"

/**
 * The sync preview as a long-lived island, like the confirm dialog. The host
 * carries the full-screen placement, since an absolute child of a static host
 * would be placed against the host rather than the screen.
 */
export function createSyncPreviewIsland(renderer: CliRenderer) {
  const [state, setState] = createStore<{ model: SyncPreviewModel | null }>({ model: null })
  const island = mountSolid(
    renderer,
    () => (
      <Show when={state.model}>
        {(model: () => SyncPreviewModel) => (
          <>
            <box position="absolute" top={0} left={0} width="100%" height="100%" backgroundColor="#00000080" />
            <SyncPreview model={model()} />
          </>
        )}
      </Show>
    ),
    {
      id: "sync-preview",
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      zIndex: 50,
      justifyContent: "center",
      alignItems: "center",
    }
  )
  return {
    host: island.host,
    update(next: SyncPreviewModel | null) {
      setState("model", reconcile(next))
    },
    dispose: island.dispose,
  }
}

export type SyncPreviewIsland = ReturnType<typeof createSyncPreviewIsland>
