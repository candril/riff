import type { CliRenderer } from "@opentui/core"
import { createStore, reconcile } from "solid-js/store"
import { StatusBar, type StatusBarProps } from "../components/StatusBar"
import { mountSolid } from "./solid-island"

/**
 * The status bar as a long-lived island: render.ts hands it fresh props on
 * every pass, and `reconcile` turns that into updates of only what changed.
 */
export function createStatusBarIsland(renderer: CliRenderer) {
  const [props, setProps] = createStore<StatusBarProps>({})
  const island = mountSolid(renderer, () => <StatusBar {...props} />, { height: 1, width: "100%" })
  return {
    host: island.host,
    update(next: StatusBarProps) {
      setProps(reconcile(next))
    },
    /** For a writer that owns one field: `update` would wipe the others. */
    patch(next: Partial<StatusBarProps>) {
      setProps(next)
    },
    dispose: island.dispose,
  }
}

export type StatusBarIsland = ReturnType<typeof createStatusBarIsland>
