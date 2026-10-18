import type { CliRenderer, TextareaRenderable } from "@opentui/core"
import { createStore, reconcile } from "solid-js/store"
import { ReviewPreview } from "../components/ReviewPreview"
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
  seedBody: "",
})

export interface ReviewPreviewIslandOptions {
  /** What the user typed into the summary, while the modal is open. */
  onSummaryChange(value: string): void
}

/**
 * The Submit Review modal as a long-lived island, like the sync preview. The
 * host carries the full-screen placement, since an absolute child of a static
 * host would be placed against the host rather than the screen.
 *
 * The summary textarea is the island's own: it is seeded as the modal opens
 * and owns the text from then on, so a pass that carries an older body never
 * overwrites what is being typed.
 */
export function createReviewPreviewIsland(renderer: CliRenderer, options: ReviewPreviewIslandOptions) {
  const [state, setState] = createStore({ shown: false, model: closed() })
  let summary!: TextareaRenderable
  let open = false
  let focused = false
  // The textarea reports a change a microtask after it happens, so its own
  // seeding cannot be fenced off with a flag around setText; it is told apart
  // by its text instead. Seeding is not typing, and echoing the body back
  // would only re-enter render.
  let known = ""

  function summaryChanged(value: string) {
    if (!open || value === known) return
    known = value
    options.onSummaryChange(value)
  }

  // Hidden rather than unmounted while closed: a node Solid removes is
  // destroyed on the next tick, the summary textarea with it, and the island
  // keeps one textarea for its whole life rather than a new one per opening.
  const island = mountSolid(
    renderer,
    () => (
      <box visible={state.shown} width="100%" height="100%" justifyContent="center" alignItems="center">
        <box position="absolute" top={0} left={0} width="100%" height="100%" backgroundColor="#00000080" />
        <ReviewPreview model={state.model} onSummary={(ref) => (summary = ref)} onSummaryChange={summaryChanged} />
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

  // Synchronous, inside the pass the opening key triggered: that key has been
  // consumed by then, so focusing here cannot type it into the summary.
  function syncSummary(next: ReviewPreviewModel | null) {
    if (!next) {
      if (open) summary.blur()
      open = false
      focused = false
      return
    }
    if (!open) {
      open = true
      known = next.seedBody
      summary.setText(next.seedBody)
    }
    if (focused !== next.summaryFocused) {
      focused = next.summaryFocused
      if (focused) summary.focus()
      else summary.blur()
    }
  }

  return {
    host: island.host,
    update(next: ReviewPreviewModel | null) {
      setState("shown", next !== null)
      if (next) setState("model", reconcile(next))
      syncSummary(next)
    },
    /** The summary as typed; "" while the modal is closed. */
    summaryValue: (): string => (open ? summary.plainText : ""),
    dispose: island.dispose,
  }
}

export type ReviewPreviewIsland = ReturnType<typeof createReviewPreviewIsland>
