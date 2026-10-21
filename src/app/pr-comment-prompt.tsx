import type { CliRenderer } from "@opentui/core"
import { batch } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { PRCommentPrompt } from "../components/PRCommentPromptView"
import type { PrCommentPromptModel } from "../components/pr-comment-prompt"
import { theme } from "../theme"
import { mountSolid } from "./solid-island"

// A fresh object per island: a store wraps the object it is given, and two
// stores built on one shared constant would write through to each other.
const emptyPrompt = (): PrCommentPromptModel => ({
  text: "",
  textFg: theme.overlay0,
  status: "",
  statusFg: theme.overlay0,
})

/**
 * The PR info panel's `gC` prompt, laid over the whole panel. Closing hides
 * the host rather than unmounting the view, so the store always holds a
 * model the view can draw and reopening restyles the boxes it already has.
 */
export function createPrCommentPromptIsland(renderer: CliRenderer) {
  const [state, setState] = createStore({ model: emptyPrompt() })
  const island = mountSolid(renderer, () => <PRCommentPrompt model={state.model} />, {
    id: "pr-comment-input-overlay",
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    zIndex: 100,
    justifyContent: "center",
    alignItems: "center",
    visible: false,
  })

  return {
    host: island.host,
    update(model: PrCommentPromptModel | null) {
      if (model) batch(() => setState("model", reconcile(model)))
      island.host.visible = model !== null
    },
    dispose() {
      island.dispose()
    },
  }
}

export type PrCommentPromptIsland = ReturnType<typeof createPrCommentPromptIsland>
