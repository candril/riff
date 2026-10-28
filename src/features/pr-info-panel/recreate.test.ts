import { afterEach, beforeEach, expect, setSystemTime, test } from "bun:test"
import { createTestRenderer } from "@opentui/core/testing"
import { PRInfoPanelClass } from "../../components/PRInfoPanel"
import type { PRInfoPanelSection } from "../../state"
import { PR_NOW } from "../../testing/pr-info"
import { refreshHarness } from "../../testing/refresh-harness"
import { handleRefresh } from "../refresh/handlers"
import { createPrInfoPanelRecreate } from "./recreate"

// A review riff started without a panel for has it built by the first
// refresh, and that panel opens what the reader left open last time.

const SAVED: ReadonlySet<PRInfoPanelSection> = new Set(["checks"])

const cleanups: (() => void)[] = []
beforeEach(() => setSystemTime(PR_NOW))
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  setSystemTime()
})

async function startedWithoutPanel() {
  const { renderer } = await createTestRenderer({ width: 120, height: 40 })
  const harness = refreshHarness()
  let panel: PRInfoPanelClass | null = null
  const rebuilds: { reread: boolean }[] = []
  harness.ctx.recreatePrInfoPanel = createPrInfoPanelRecreate({
    getState: harness.ctx.getState,
    getPanel: () => panel,
    setPanel: (next) => { panel = next },
    build: (prInfo, files, comments, openSections) => new PRInfoPanelClass(renderer, prInfo, files, comments, openSections),
    saved: SAVED,
    wire: (_, rebuild) => { rebuilds.push(rebuild) },
    rebuilt: () => {},
  })
  cleanups.push(() => {
    panel?.destroy()
    renderer.destroy()
  })
  return { ...harness, panel: () => panel, rebuilds }
}

test("a refresh that builds the first panel opens the sections saved for the review", async () => {
  const { ctx, panel, rebuilds } = await startedWithoutPanel()
  expect(panel()).toBeNull()

  await handleRefresh(ctx)

  expect(panel()?.isSectionExpandedNamed("checks")).toBe(true)
  expect(panel()?.isSectionExpandedNamed("description")).toBe(false)
  expect(rebuilds).toEqual([{ reread: true }])
})

test("a rebuild of that panel keeps where the reader left it, not what was saved", async () => {
  const { ctx, panel } = await startedWithoutPanel()
  await handleRefresh(ctx)
  panel()!.setActiveSection("files")
  panel()!.expandSection()
  panel()!.setActiveSection("checks")
  panel()!.collapseSection()

  ctx.recreatePrInfoPanel()

  expect(panel()?.isSectionExpandedNamed("files")).toBe(true)
  expect(panel()?.isSectionExpandedNamed("checks")).toBe(false)
})
