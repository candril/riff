import { test, expect, describe } from "bun:test"
import { panelMeta, sectionHeaderRow, stackLine } from "../components/pr-info-header"
import { fileRows } from "../components/pr-info-list-rows"
import type { PanelSection } from "../components/pr-info-panel-model"
import type { SectionConfig } from "../components/pr-info-sections"
import { ints } from "../testing/frame"
import { ago, prInfo, reviews } from "../testing/pr-info"
import { PR_FILES } from "../testing/pr-info-panel"
import { section, usePrInfoPanelIsland } from "../testing/pr-info-panel-island"
import { colors, theme } from "../theme"

const mountIsland = usePrInfoPanelIsland()

describe("a list section", () => {
  const files = (selected: number, labels: ReadonlyMap<string, string> = new Map()): PanelSection[] => [
    section("files", { kind: "list", rows: fileRows(PR_FILES, { selected, labels, listWidth: 93 }) }),
  ]

  // The list's box is 40 wide on a 46-wide screen: the scroll box's padding and the body's indent.
  test("a push draws a row per item, the selected one on surface0", async () => {
    const { island, byId, inside } = await mountIsland({ width: 46, height: 14 })
    island.update({ sections: files(0) })
    const { frame, bg, fg } = await inside(() => byId("pr-info-files"), 4)
    expect(frame).toBe(["src/greet.ts       +3    -1", "src/farewell.ts    +5    -0"].join("\n"))
    expect(bg(0, 0)).toEqual(ints(theme.surface0))
    expect(bg(39, 0)).toEqual(ints(theme.surface0))
    expect(fg(0, 0)).toEqual(ints(theme.text))
    expect(fg(19, 0)).toEqual(ints(theme.green))
    expect(fg(25, 0)).toEqual(ints(theme.red))
    expect(fg(0, 1)).toEqual(ints(theme.subtext1))
  })

  test("a second push moves the selection onto the same row renderables, and labels a row", async () => {
    const { island, byId, inside } = await mountIsland({ width: 46, height: 14 })
    island.update({ sections: files(0) })
    await inside(() => byId("pr-info-files"), 4)
    const first = island.rowAt("files", 0)
    const second = island.rowAt("files", 1)

    island.update({ sections: files(1, new Map([["files:1", "sd"]])) })
    const { lines, bg, fg } = await inside(() => byId("pr-info-files"), 4)
    expect(lines[1]).toBe("sd src/farewell.ts    +5    -0")
    expect(island.rowAt("files", 0)).toBe(first)
    expect(island.rowAt("files", 1)).toBe(second)
    expect(bg(0, 0)).not.toEqual(ints(theme.surface0))
    expect(fg(0, 0)).toEqual(ints(theme.subtext1))
    expect(bg(0, 1)).toEqual(ints(theme.surface0))
    expect(fg(0, 1)).toEqual(ints(colors.flashLabel))
    expect(fg(3, 1)).toEqual(ints(theme.text))
  })

  test("the note stands alone when there are no rows, and is no row", async () => {
    const { island, byId, inside } = await mountIsland({ width: 46, height: 14 })
    island.update({ sections: [section("files", { kind: "list", rows: fileRows([], { selected: -1, labels: new Map(), listWidth: 93 }) })] })
    expect((await inside(() => byId("pr-info-files"), 4)).frame).toBe("No files changed")
    expect(island.rowAt("files", 0)).toBeUndefined()
  })

  test("dispose destroys the host and leaves the screen empty", async () => {
    const { island: shown, screen } = await mountIsland({ width: 46, height: 14 })
    shown.update({ sections: files(0) })
    await screen.frame()
    shown.dispose()
    expect(shown.host.isDestroyed).toBe(true)
    expect(screen.setup.renderer.root.getChildren()).toHaveLength(0)
    expect(await screen.frame()).toBe("")
  })
})

describe("a section header", () => {
  const checks: SectionConfig = { id: "checks", title: "Checks", count: 6, summary: [{ text: "✗ 4 failed", fg: theme.red }], hasItems: true }

  test("follows each push: expanded and highlighted, then collapsed with a label", async () => {
    const { island, byId, inside } = await mountIsland({ width: 44, height: 10 })
    const row = (state: Parameters<typeof sectionHeaderRow>[1]): PanelSection[] => [
      { key: "checks", header: sectionHeaderRow(checks, state), expanded: state.expanded, body: null },
    ]

    island.update({ sections: row({ active: true, expanded: true, highlighted: true, label: null }) })
    let drawn = await inside(() => byId("pr-info-header-checks"), 1)
    expect(drawn.frame).toBe("▼  Checks (6)")
    expect(drawn.fg(0, 0)).toEqual(ints(theme.blue))
    expect(drawn.bg(0, 0)).toEqual(ints(theme.surface0))
    expect(drawn.bg(39, 0)).toEqual(ints(theme.surface0))

    island.update({ sections: row({ active: false, expanded: false, highlighted: false, label: "a" }) })
    drawn = await inside(() => byId("pr-info-header-checks"), 1)
    expect(drawn.frame).toBe("a ▶  Checks (6)  ✗ 4 failed")
    expect(drawn.fg(0, 0)).toEqual(ints(colors.flashLabel))
    expect(drawn.fg(2, 0)).toEqual(ints(theme.overlay0))
    expect(drawn.fg(18, 0)).toEqual(ints(theme.red))
    expect(drawn.bg(0, 0)).not.toEqual(ints(theme.surface0))
  })
})

describe("the meta row", () => {
  test("follows each push: approvers and stack line come and go", async () => {
    const { island, byId, inside } = await mountIsland({ width: 84, height: 10 })

    island.update({ meta: { meta: panelMeta(prInfo("", { reviews: reviews() })), stack: stackLine(undefined) } })
    let drawn = await inside(() => byId("pr-info-meta"), 2)
    expect(drawn.frame).toBe("@someone  a-branch → master   ✓ @alice @erin")
    expect(drawn.fg(0, 0)).toEqual(ints(theme.blue))
    expect(drawn.fg(10, 0)).toEqual(ints(theme.subtext0))
    expect(drawn.fg(30, 0)).toEqual(ints(theme.green))

    const superseded = [
      ...reviews(),
      { id: "PRR_alice2", author: "alice", state: "CHANGES_REQUESTED" as const, submittedAt: ago(1) },
    ]
    island.update({
      meta: {
        meta: panelMeta(prInfo("", { reviews: superseded })),
        stack: stackLine({ basePr: { number: 1200, title: "Base work" }, status: "rewritten", behindBy: 2 }),
      },
    })
    drawn = await inside(() => byId("pr-info-meta"), 2)
    expect(drawn.frame).toBe(
      ["@someone  a-branch → master   ✓ @erin", "stacked on #1200 Base work · base rewritten since you branched — rebase"].join("\n")
    )
    expect(drawn.fg(0, 1)).toEqual(ints(theme.yellow))

    island.update({ meta: { meta: panelMeta(prInfo("")), stack: stackLine(null) } })
    expect((await inside(() => byId("pr-info-meta"), 2)).frame).toBe("@someone  a-branch → master")
  })
})
