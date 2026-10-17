import type { CliRenderer } from "@opentui/core"
import { createStore, reconcile } from "solid-js/store"
import { Header, type HeaderViewProps } from "../components/Header"
import { mountSolid } from "./solid-island"

/**
 * The header as a long-lived island: render.ts hands it a fresh model on
 * every pass, and `reconcile` turns that into updates of only what changed.
 */
export function createHeaderIsland(renderer: CliRenderer) {
  const [props, setProps] = createStore<HeaderViewProps>({ left: [], leftGap: 0, right: [] })
  const island = mountSolid(renderer, () => <Header {...props} />, { height: 1, width: "100%" })
  return {
    host: island.host,
    update(next: HeaderViewProps) {
      setProps(reconcile(next))
    },
    dispose: island.dispose,
  }
}

export type HeaderIsland = ReturnType<typeof createHeaderIsland>
