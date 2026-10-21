import type { CliRenderer } from "@opentui/core"
import { batch } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { PRInfoMeta, PRInfoSectionHeader } from "../components/PRInfoHeaderViews"
import type { PanelMeta, SectionHeaderRow, StackLine } from "../components/pr-info-header"
import type { PRInfoPanelSection } from "../state"
import { theme } from "../theme"
import { mountSolid } from "./solid-island"

// A fresh object per island: a store wraps the object it is given, and two
// stores built on one shared constant would write through to each other.
const emptyHeader = (key: PRInfoPanelSection): SectionHeaderRow => ({
  key,
  label: null,
  text: "",
  fg: theme.overlay0,
  preview: null,
  highlighted: false,
})
const emptyMeta = (): { meta: PanelMeta; stack: StackLine } => ({
  meta: { author: "", branches: "", approvers: [] },
  stack: { text: "", fg: theme.subtext0, visible: true },
})

/**
 * One section header of the PR info panel as a long-lived island. Like the
 * section bodies, its host outlives the section box each rebuild discards,
 * and a push restyles the row it already has.
 */
export function createPrInfoHeaderIsland(renderer: CliRenderer, section: PRInfoPanelSection) {
  const [state, setState] = createStore({ row: emptyHeader(section) })
  const island = mountSolid(renderer, () => <PRInfoSectionHeader row={state.row} />, {
    id: `pr-info-header-${section}`,
    flexDirection: "column",
  })

  return {
    host: island.host,
    update(row: SectionHeaderRow) {
      batch(() => setState("row", reconcile(row)))
    },
    dispose() {
      island.dispose()
    },
  }
}

export type PrInfoHeaderIsland = ReturnType<typeof createPrInfoHeaderIsland>

/** The meta row and the stack line above the PR info panel's sections, as one island. */
export function createPrInfoMetaIsland(renderer: CliRenderer) {
  const [state, setState] = createStore(emptyMeta())
  const island = mountSolid(renderer, () => <PRInfoMeta meta={state.meta} stack={state.stack} />, {
    id: "pr-info-meta",
    flexDirection: "column",
  })

  return {
    host: island.host,
    update(model: { meta: PanelMeta; stack: StackLine }) {
      batch(() => setState(reconcile(model)))
    },
    dispose() {
      island.dispose()
    },
  }
}

export type PrInfoMetaIsland = ReturnType<typeof createPrInfoMetaIsland>
