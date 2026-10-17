import type { CliRenderer } from "@opentui/core"
import { Show } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { ConfirmDialog } from "../components/ConfirmDialog"
import type { ConfirmDialogModel } from "../components/confirm-dialog-model"
import { mountSolid } from "./solid-island"

/**
 * The confirm dialog as a long-lived island, like the toast. The host carries
 * the full-screen placement, since an absolute child of a static host would be
 * placed against the host rather than the screen.
 */
export function createConfirmDialogIsland(renderer: CliRenderer) {
  const [state, setState] = createStore<{ model: ConfirmDialogModel | null }>({ model: null })
  const island = mountSolid(
    renderer,
    () => (
      <Show when={state.model}>
        {(model: () => ConfirmDialogModel) => (
          <>
            <box position="absolute" top={0} left={0} width="100%" height="100%" backgroundColor="#00000080" />
            <ConfirmDialog model={model()} />
          </>
        )}
      </Show>
    ),
    {
      id: "confirm-dialog",
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      zIndex: 100,
      justifyContent: "center",
      alignItems: "center",
    }
  )
  return {
    host: island.host,
    update(next: ConfirmDialogModel | null) {
      setState("model", reconcile(next))
    },
    dispose: island.dispose,
  }
}

export type ConfirmDialogIsland = ReturnType<typeof createConfirmDialogIsland>
