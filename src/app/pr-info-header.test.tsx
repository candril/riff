import { test, expect, afterEach } from "bun:test"
import { createPrInfoHeaderIsland, createPrInfoMetaIsland } from "./pr-info-header"
import { panelMeta, sectionHeaderRow, stackLine } from "../components/pr-info-header"
import type { SectionConfig } from "../components/pr-info-sections"
import { bgAt, fgAt, ints, mountRenderable } from "../testing/frame"
import { ago, prInfo, reviews } from "../testing/pr-info"
import { colors, theme } from "../theme"

let mounted: Awaited<ReturnType<typeof mountRenderable>> | null = null

afterEach(async () => {
  await mounted?.dispose()
  mounted = null
})

const checks: SectionConfig = { id: "checks", title: "Checks", count: 6, preview: "✗ 4 failed", hasItems: true }

test("a header island follows each push: expanded and highlighted, then collapsed with a label", async () => {
  let island!: ReturnType<typeof createPrInfoHeaderIsland>
  mounted = await mountRenderable((renderer) => {
    island = createPrInfoHeaderIsland(renderer, "checks")
    return island.host
  }, { width: 40, height: 1 })

  island.update(sectionHeaderRow(checks, { active: true, expanded: true, highlighted: true, label: null }))
  expect(await mounted.frame()).toBe("▼  Checks (6)")
  let spans = mounted.setup.captureSpans()
  expect(fgAt(spans, 0, 0)).toEqual(ints(theme.blue))
  expect(bgAt(spans, 0, 0)).toEqual(ints(theme.surface0))
  expect(bgAt(spans, 39, 0)).toEqual(ints(theme.surface0))

  island.update(sectionHeaderRow(checks, { active: false, expanded: false, highlighted: false, label: "a" }))
  expect(await mounted.frame()).toBe("a ▶  Checks (6)  ✗ 4 failed")
  spans = mounted.setup.captureSpans()
  expect(fgAt(spans, 0, 0)).toEqual(ints(colors.flashLabel))
  expect(fgAt(spans, 2, 0)).toEqual(ints(theme.overlay0))
  expect(fgAt(spans, 18, 0)).toEqual(ints(theme.subtext0))
  expect(bgAt(spans, 0, 0)).not.toEqual(ints(theme.surface0))
})

test("the meta island follows each push: approvers and stack line come and go", async () => {
  let island!: ReturnType<typeof createPrInfoMetaIsland>
  mounted = await mountRenderable((renderer) => {
    island = createPrInfoMetaIsland(renderer)
    return island.host
  }, { width: 80, height: 3 })

  island.update({ meta: panelMeta(prInfo("", { reviews: reviews() })), stack: stackLine(undefined) })
  expect(await mounted.frame()).toBe("@someone  a-branch → master   ✓ @alice @erin")
  let spans = mounted.setup.captureSpans()
  expect(fgAt(spans, 0, 0)).toEqual(ints(theme.blue))
  expect(fgAt(spans, 10, 0)).toEqual(ints(theme.subtext0))
  expect(fgAt(spans, 30, 0)).toEqual(ints(theme.green))

  const superseded = [
    ...reviews(),
    { id: "PRR_alice2", author: "alice", state: "CHANGES_REQUESTED" as const, submittedAt: ago(1) },
  ]
  island.update({
    meta: panelMeta(prInfo("", { reviews: superseded })),
    stack: stackLine({ basePr: { number: 1200, title: "Base work" }, status: "rewritten", behindBy: 2 }),
  })
  expect(await mounted.frame()).toBe(
    ["@someone  a-branch → master   ✓ @erin", "stacked on #1200 Base work · base rewritten since you branched — rebase"].join("\n")
  )
  spans = mounted.setup.captureSpans()
  expect(fgAt(spans, 0, 1)).toEqual(ints(theme.yellow))

  island.update({ meta: panelMeta(prInfo("")), stack: stackLine(null) })
  expect(await mounted.frame()).toBe("@someone  a-branch → master")
})
