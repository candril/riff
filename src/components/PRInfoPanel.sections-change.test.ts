import { test, expect, describe } from "bun:test"
import type { PRInfoPanelSection } from "../state"
import { usePrInfoPanel } from "../testing/pr-info-panel"
import type { PRInfoPanelClass } from "./PRInfoPanel"

// What the panel reports as the reader's folds, which app.ts keeps for the
// review: their own opens and folds, never what a filter opened or a rebuilt
// panel was handed back (spec 067).

const mount = usePrInfoPanel()

function recording(panel: PRInfoPanelClass): PRInfoPanelSection[][] {
  const reported: PRInfoPanelSection[][] = []
  panel.setOnSectionsChange((open) => reported.push([...open].sort()))
  return reported
}

describe("the sections the reader opens", () => {
  test("toggling one reports the new set, and toggling it back reports that", async () => {
    const { panel } = await mount({ openSections: ["description"] })
    const reported = recording(panel)
    panel.setActiveSection("files")
    panel.toggleSection()
    panel.toggleSection()
    expect(reported).toEqual([["description", "files"], ["description"]])
  })

  test("expanding or collapsing one reports it only when it changes something", async () => {
    const { panel } = await mount({ openSections: ["files"] })
    const reported = recording(panel)
    panel.setActiveSection("files")
    panel.expandSection()
    panel.collapseSection()
    panel.collapseSection()
    expect(reported).toEqual([[]])
  })

  test("expanding and collapsing all report every section, then none", async () => {
    const { panel } = await mount({ openSections: [] })
    const reported = recording(panel)
    panel.expandAllSections()
    panel.collapseAllSections()
    expect(reported).toEqual([["checks", "commits", "conversation", "description", "files", "previews"], []])
  })

  test("a filter that opens sections, and clearing it, report nothing", async () => {
    const { panel } = await mount({ openSections: [] })
    const reported = recording(panel)
    panel.setFilter("greet")
    expect(panel.isSectionExpandedNamed("files")).toBe(true)
    panel.setFilter("")
    expect(reported).toEqual([])
  })

  test("a position handed back to a rebuilt panel reports nothing", async () => {
    const first = await mount({ openSections: ["files", "commits"] })
    const { panel } = await mount({ openSections: [] })
    const reported = recording(panel)
    panel.restorePosition(first.panel.capturePosition())
    expect(panel.isSectionExpandedNamed("commits")).toBe(true)
    expect(reported).toEqual([])
  })
})
