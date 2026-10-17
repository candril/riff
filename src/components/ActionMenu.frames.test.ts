import { test, expect, describe, afterEach } from "bun:test"
import { bgAt, fgAt, ints, mountRenderable } from "../testing/frame"
import { theme } from "../theme"
import { actionMenuModel, type ActionMenuMode, type SubmenuRow } from "./action-menu-model"
import { createActionMenuIsland } from "../app/pickers"
import type { ResolvedAction } from "../actions"

let mounted: Awaited<ReturnType<typeof mountRenderable>> | null = null

async function frame(mode: ActionMenuMode, selectedIndex = 0, { width, height } = { width: 100, height: 40 }) {
  mounted = await mountRenderable(
    (renderer) => {
      const island = createActionMenuIsland(renderer)
      island.update(actionMenuModel(mode, selectedIndex, height))
      return island.host
    },
    { width, height }
  )
  return (await mounted.frame()).split("\n")
}

afterEach(async () => {
  await mounted?.dispose()
  mounted = null
})

function action(id: string, label: string, category: ResolvedAction["category"], shortcut?: string): ResolvedAction {
  return { id, label, description: label, category, shortcut, available: () => true }
}

// Out of registry order, so only the palette's grouping can put them in order.
const ACTIONS: ResolvedAction[] = [
  action("quit", "Quit", "general", "q"),
  action("split", "Toggle split view", "view", "s"),
  action("ask", "Ask Claude", "claude"),
  action("files", "Go to file", "navigation", "ctrl+f"),
  action("editor", "Open in editor", "external", "e"),
  action("pr", "Open PR in browser", "github", "o"),
]

const GROUPS = ["Claude", "GitHub", "Navigation", "View", "External Tools", "General"]
const VISUAL = ["Ask Claude", "Open PR in browser", "Go to file", "Toggle split view", "Open in editor", "Quit"]

const ROWS: SubmenuRow[] = [
  { id: "react:+1", icon: "↑", label: "Thumbs up", trailing: "2 · you reacted", accented: true },
  { id: "react:heart", icon: "♥", label: "Heart", trailing: "1" },
  { id: "link:0", label: "Docs", trailing: "https://example.com/" + "a".repeat(80) },
  { id: "link:1", label: "Plain" },
]

describe("the command palette", () => {
  test("titles itself Commands with esc on one row, half the screen wide in the middle", async () => {
    const lines = await frame({ kind: "actions", actions: ACTIONS })
    const title = lines.find((l) => l.includes("Commands"))!
    expect(title).toMatch(/Commands\s+esc$/)
    expect(title.indexOf("Commands")).toBe(27)
    expect(title.length).toBe(73)
  })

  test("groups the actions under lavender headers in category order", async () => {
    const lines = await frame({ kind: "actions", actions: ACTIONS })
    const spans = mounted!.setup.captureSpans()
    const headers = GROUPS.map((group) => lines.findIndex((l) => l.trim() === group))
    expect(headers.every((y) => y > 0)).toBe(true)
    expect([...headers].sort((a, b) => a - b)).toEqual(headers)
    for (const y of headers) expect(fgAt(spans, 27, y)).toEqual(ints(theme.lavender))
    const labels = VISUAL.map((label) => lines.findIndex((l) => l.includes(label)))
    expect([...labels].sort((a, b) => a - b)).toEqual(labels)
    labels.forEach((y, i) => expect(y).toBe(headers[i]! + 1))
  })

  test("puts each label on the left and its shortcut flush right", async () => {
    const lines = await frame({ kind: "actions", actions: ACTIONS })
    const files = lines.find((l) => l.includes("Go to file"))!
    expect(files.indexOf("Go to file")).toBe(27)
    expect(files).toMatch(/Go to file\s+ctrl\+f$/)
    expect(files.length).toBe(73)
    expect(lines.find((l) => l.includes("Ask Claude"))!.trimEnd()).toMatch(/Ask Claude$/)
  })

  test("shades the selected row by its place across the groups, and the field, surface0 on the mantle", async () => {
    const lines = await frame({ kind: "actions", actions: ACTIONS }, 3)
    const spans = mounted!.setup.captureSpans()
    const selected = lines.findIndex((l) => l.includes("Toggle split view"))
    const other = lines.findIndex((l) => l.includes("Go to file"))
    const field = lines.findIndex((l) => l.includes("Commands")) + 2
    expect(fgAt(spans, 27, selected)).toEqual(ints(theme.text))
    expect(fgAt(spans, 27, other)).toEqual(ints(theme.subtext1))
    expect(bgAt(spans, 27, selected)).toEqual(ints(theme.surface0))
    expect(bgAt(spans, 27, other)).toEqual(ints(theme.mantle))
    expect(bgAt(spans, 30, field)).toEqual(ints(theme.surface0))
  })

  test("draws no box-drawing characters and no surface2, on mantle", async () => {
    const lines = await frame({ kind: "actions", actions: ACTIONS }, 3)
    const spans = mounted!.setup.captureSpans()
    expect(lines.join("\n")).not.toMatch(/[─-╿]/)
    const surface2 = ints("#585b70")
    for (const line of spans.lines) {
      for (const span of line.spans) expect(span.bg.toInts()).not.toEqual(surface2)
    }
    const title = lines.findIndex((l) => l.includes("Commands"))
    expect(bgAt(spans, 26, title)).toEqual(ints(theme.mantle))
    expect(bgAt(spans, 27, lines.findIndex((l) => l.includes("Quit")))).toEqual(ints(theme.mantle))
  })
})

describe("a submenu", () => {
  const submenu = (hint?: string): ActionMenuMode => ({ kind: "submenu", title: "React", hint, rows: ROWS })

  test("titles itself with its own title and esc to back unless given a hint", async () => {
    expect((await frame(submenu())).find((l) => l.includes("React"))).toMatch(/React\s+esc to back$/)
    await mounted!.dispose()
    mounted = null
    const given = await frame(submenu("enter open · ctrl-y copy · esc"))
    expect(given.find((l) => l.includes("React"))).toMatch(/React\s+enter open · ctrl-y copy · esc$/)
  })

  test("lists flat rows, the icon two spaces before the label and the note flush right", async () => {
    const lines = await frame(submenu(), 1)
    const text = lines.join("\n")
    expect(text).not.toContain("Claude")
    const heart = lines.find((l) => l.includes("Heart"))!
    expect(heart.indexOf("♥  Heart")).toBe(27)
    expect(heart).toMatch(/♥  Heart\s+1$/)
    expect(heart.length).toBe(73)
    expect(lines.find((l) => l.includes("Plain"))!.trimEnd()).toMatch(/ {2}Plain$/)
  })

  test("colours an accented row's note green and another's overlay0", async () => {
    const lines = await frame(submenu(), 1)
    const spans = mounted!.setup.captureSpans()
    const thumbs = lines.findIndex((l) => l.includes("Thumbs up"))
    const heart = lines.findIndex((l) => l.includes("Heart"))
    expect(fgAt(spans, lines[thumbs]!.indexOf("you reacted"), thumbs)).toEqual(ints(theme.green))
    expect(fgAt(spans, lines[heart]!.lastIndexOf("1"), heart)).toEqual(ints(theme.overlay0))
    expect(fgAt(spans, 27, heart)).toEqual(ints(theme.text))
    expect(bgAt(spans, 27, heart)).toEqual(ints(theme.surface0))
    expect(fgAt(spans, 27, lines.findIndex((l) => l.includes("Plain")))).toEqual(ints(theme.subtext1))
  })

  test("clips a long note on its row rather than wrapping it", async () => {
    const lines = await frame(submenu())
    const docs = lines.findIndex((l) => l.includes("Docs"))
    expect(lines[docs]).toContain("https://example.com/")
    expect(lines[docs]!.length).toBeLessThanOrEqual(75)
    expect(lines[docs + 1]).toContain("Plain")
  })
})

describe("on a short terminal", () => {
  const categories = ["claude", "github", "navigation", "view", "external", "general"] as const
  const many = Array.from({ length: 40 }, (_, i) =>
    action(`a${i}`, `Action ${String(i).padStart(2, "0")}`, categories[Math.floor(i / 7)])
  )

  test("keeps the last action in view, says how many lie above, and ends the panel on screen", async () => {
    const lines = await frame({ kind: "actions", actions: many }, 39, { width: 80, height: 24 })
    const spans = mounted!.setup.captureSpans()
    const selected = lines.findIndex((l) => l.includes("Action 39"))
    expect(selected).toBeGreaterThan(0)
    expect(bgAt(spans, 22, selected)).toEqual(ints(theme.surface0))
    expect(lines.some((l) => /↑ \d+ more/.test(l))).toBe(true)
    expect(lines.some((l) => /↓ \d+ more/.test(l))).toBe(false)
    // The padding under the list is the panel's last row.
    expect(selected + 1).toBeLessThan(24)
    expect(bgAt(spans, 22, selected + 1)).toEqual(ints(theme.mantle))
  })

  test("keeps a selection in the middle roughly centred, with notes on both sides", async () => {
    const lines = await frame({ kind: "actions", actions: many }, 20, { width: 80, height: 24 })
    const spans = mounted!.setup.captureSpans()
    const selected = lines.findIndex((l) => l.includes("Action 20"))
    const above = lines.findIndex((l) => /↑ \d+ more/.test(l))
    const below = lines.findIndex((l) => /↓ \d+ more/.test(l))
    expect(above).toBeGreaterThan(0)
    expect(above).toBeLessThan(selected)
    expect(below).toBeGreaterThan(selected)
    expect(below + 1).toBeLessThan(24)
    expect(bgAt(spans, 22, below + 1)).toEqual(ints(theme.mantle))
    expect(Math.abs(selected - above - (below - selected))).toBeLessThanOrEqual(4)
  })

  test("windows a long submenu the same way", async () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ id: `link:${i}`, label: `Link ${String(i).padStart(2, "0")}` }))
    const lines = await frame({ kind: "submenu", title: "Links", rows }, 29, { width: 80, height: 24 })
    expect(lines.some((l) => l.includes("Link 29"))).toBe(true)
    expect(lines.some((l) => /↑ 15 more/.test(l))).toBe(true)
    expect(lines.length).toBeLessThanOrEqual(24)
  })
})
