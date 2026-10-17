import type { CliRenderer } from "@opentui/core"
import { Show } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { HelpOverlay } from "../components/HelpOverlay"
import type { HelpOverlayModel } from "../components/help-overlay-model"
import { mountSolid } from "./solid-island"

/**
 * The help overlay as a long-lived island, like the confirm dialog. The host
 * carries the full-screen placement, since an absolute child of a static host
 * would be placed against the host rather than the screen.
 */
export function createHelpOverlayIsland(renderer: CliRenderer) {
  const [state, setState] = createStore<{ model: HelpOverlayModel | null }>({ model: null })
  const island = mountSolid(
    renderer,
    () => (
      <Show when={state.model}>
        {(model: () => HelpOverlayModel) => (
          <>
            <box position="absolute" top={0} left={0} width="100%" height="100%" backgroundColor="#00000080" />
            <HelpOverlay model={model()} />
          </>
        )}
      </Show>
    ),
    {
      id: "help-overlay",
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      // Above every panel it can be opened from — the overview mounts its
      // own container at 100.
      zIndex: 110,
      justifyContent: "center",
      alignItems: "center",
    }
  )
  return {
    host: island.host,
    update(next: HelpOverlayModel | null) {
      setState("model", reconcile(next))
    },
    dispose: island.dispose,
  }
}

export type HelpOverlayIsland = ReturnType<typeof createHelpOverlayIsland>
