import type { CliRenderer } from "@opentui/core"
import { createStore, reconcile } from "solid-js/store"
import { ReviewPreview } from "../components/ReviewPreview"
import { getReviewSummaryRenderable } from "../components/ReviewSummaryComposer"
import type { ReviewPreviewModel } from "../components/review-preview-model"
import { mountSolid } from "./solid-island"

// A fresh object per island: a store wraps the object it is given, and two
// stores built on one shared constant would write through to each other.
const closed = (): ReviewPreviewModel => ({
  chips: [],
  banner: null,
  summaryFocused: false,
  commentsFocused: false,
  comments: [],
  moreCount: 0,
  includedCount: 0,
  validCount: 0,
  status: { text: "", tone: "idle" },
  submitEnabled: false,
})

/**
 * The Submit Review modal as a long-lived island, like the sync preview. The
 * host carries the full-screen placement, since an absolute child of a static
 * host would be placed against the host rather than the screen.
 */
export function createReviewPreviewIsland(renderer: CliRenderer) {
  const summary = getReviewSummaryRenderable(renderer)
  const [state, setState] = createStore({ shown: false, model: closed() })
  // Hidden rather than unmounted while closed: a node Solid removes is
  // destroyed on the next tick once it has no parent, and the modal would
  // take ReviewSummaryComposer's textarea down with it. The textarea is kept
  // alive, but only riff's own `discard` honours that, not Solid.
  const island = mountSolid(
    renderer,
    () => (
      <box visible={state.shown} width="100%" height="100%" justifyContent="center" alignItems="center">
        <box position="absolute" top={0} left={0} width="100%" height="100%" backgroundColor="#00000080" />
        <ReviewPreview model={state.model} summary={summary} />
      </box>
    ),
    {
      id: "review-preview",
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
    update(next: ReviewPreviewModel | null) {
      setState("shown", next !== null)
      if (next) setState("model", reconcile(next))
    },
    dispose: island.dispose,
  }
}

export type ReviewPreviewIsland = ReturnType<typeof createReviewPreviewIsland>
