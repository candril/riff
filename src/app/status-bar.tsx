import type { CliRenderer } from "@opentui/core"
import { createStore, reconcile, type SetStoreFunction } from "solid-js/store"
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
      patchFields(setProps, next)
    },
    dispose: island.dispose,
  }
}

/**
 * A plain store merge swaps an object field by reference, so a writer that
 * hands over a fresh but equal object on every motion would re-set its text
 * each time; `reconcile` per field notifies only what actually differs.
 */
export function patchFields<T extends object>(set: SetStoreFunction<T>, next: Partial<T>): void {
  const setField = set as (key: keyof T, value: unknown) => void
  for (const key of Object.keys(next) as (keyof T)[]) {
    const value = next[key]
    setField(key, value !== null && typeof value === "object" ? reconcile(value) : value)
  }
}

export type StatusBarIsland = ReturnType<typeof createStatusBarIsland>
