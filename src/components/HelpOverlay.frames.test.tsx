import { test, expect, afterEach } from "bun:test"
import { mountJsx } from "../testing/frame"
import { HelpOverlay } from "./HelpOverlay"
import { helpOverlayModel } from "./help-overlay-model"
import { HELP_MARGIN, HELP_PADDING, helpViewport } from "./help-sections"

let mounted: Awaited<ReturnType<typeof mountJsx>> | null = null

const FOOTER = /Press g\? or Esc to close|j \/ k scroll · g\? or Esc to close/

// Wide enough for both columns side by side.
const WIDE = 180

/** The overlay centred on a screen of its own, as the island places it. */
async function frame({ version, scroll = 0, width = WIDE, height = 70 }: { version?: string; scroll?: number; width?: number; height?: number } = {}) {
  mounted = await mountJsx(
    () => (
      <box width="100%" height="100%" justifyContent="center" alignItems="center">
        <HelpOverlay model={helpOverlayModel(version, scroll, height, width)} />
      </box>
    ),
    { width, height }
  )
  return (await mounted.frame()).split("\n")
}

async function titleRow(version?: string) {
  const row = (await frame({ version })).find((line) => line.includes("Keyboard Shortcuts"))
  expect(row).toBeDefined()
  return row!
}

afterEach(async () => {
  await mounted?.dispose()
  mounted = null
})

test("the title row names the build to the right of the title", async () => {
  const row = await titleRow("9.9.9+test")
  expect(row).toContain("riff 9.9.9+test")
  expect(row.indexOf("riff 9.9.9+test")).toBeGreaterThan(row.indexOf("Keyboard Shortcuts"))
})

test("without a version the title row holds the title alone", async () => {
  expect(await titleRow()).not.toContain("riff ")
})

test("a key from each column sits on one row with its description, above the footer", async () => {
  const rows = await frame()
  const row = rows.find((line) => line.includes("j / k"))
  expect(row).toMatch(/j \/ k\s+Move down \/ up\s+Ctrl\+b\s+Toggle file tree/)
  expect(rows.findIndex((line) => line.includes("Press g? or Esc to close"))).toBeGreaterThan(rows.indexOf(row!))
})

test("the composer's keys are drawn with what they do, above the footer", async () => {
  const rows = await frame()
  const footer = rows.findIndex((line) => line.includes("Press g? or Esc to close"))
  const publish = rows.findIndex((line) => /Ctrl\+p\s+Save & publish/.test(line))
  const newline = rows.findIndex((line) => /Ctrl\+j\s+Newline/.test(line))
  const pick = rows.findIndex((line) => /Tab\/Enter\/Ctrl\+y\s+Pick in a picker/.test(line))
  expect(publish).toBeGreaterThan(-1)
  expect(newline).toBeGreaterThan(-1)
  expect(pick).toBeGreaterThan(-1)
  expect(footer).toBeGreaterThan(Math.max(publish, newline, pick))
})

test("gB is drawn with the blame peek and gb with the blame column, above the footer, and riff board has no key", async () => {
  const rows = await frame()
  const peek = rows.findIndex((line) => /gB\s+Who last changed this line/.test(line))
  const column = rows.findIndex((line) => /gb\s+Blame column for this file/.test(line))
  expect(peek).toBeGreaterThan(-1)
  expect(column).toBeGreaterThan(-1)
  expect(rows.findIndex((line) => line.includes("Press g? or Esc to close"))).toBeGreaterThan(Math.max(peek, column))
  expect(rows.join("\n")).not.toContain("riff board")
})

test("where every key fits, the footer offers no scrolling and nothing is marked as more", async () => {
  const rows = await frame()
  expect(rows.join("\n")).not.toContain("j / k scroll")
  expect(rows.join("\n")).not.toContain("more")
  expect(rows.some((line) => /q\s+Quit/.test(line))).toBe(true)
})

test("on a 40-row terminal the overlay fits, its footer once below every key, no row drawn over another", async () => {
  const rows = await frame({ width: 120, height: 40 })
  const title = rows.findIndex((line) => line.includes("Keyboard Shortcuts"))
  const footers = rows.flatMap((line, i) => (FOOTER.test(line) ? [i] : []))
  expect(title).toBeGreaterThan(-1)
  expect(footers).toHaveLength(1)
  expect(rows[footers[0]!]!.replace(FOOTER, "").replace(/[↑↓] more/, "").trim()).toBe("")
  // Two rows of padding stay below the footer inside the 40.
  expect(footers[0]!).toBeLessThanOrEqual(37)
  const keyRows = rows.flatMap((line, i) => (/\S\s{2,}\S/.test(line) && i > title && i < footers[0]! ? [i] : []))
  expect(Math.max(...keyRows)).toBeLessThan(footers[0]!)
  const gd = rows.find((line) => line.includes("gd / gD"))
  if (gd !== undefined) expect(gd).toMatch(/gd \/ gD\s+Diff this file in \$EDITOR \/ a tmux pane/)
  expect(rows[footers[0]!]).toContain("j / k scroll · g? or Esc to close")
  expect(rows[footers[0]!]).toContain("↓ more")
})

test("scrolled to the end on a 40-row terminal, Quit shows, Navigation is gone, and more lies above", async () => {
  const rows = await frame({ width: 120, height: 40, scroll: helpViewport(40, 120).maxScroll })
  const text = rows.join("\n")
  expect(rows.some((line) => /q\s+Quit/.test(line))).toBe(true)
  expect(text).not.toContain("Navigation")
  expect(text).toContain("↑ more")
  expect(text).not.toContain("↓ more")
})

test("at 104 columns every description is drawn whole, the left column's among them", async () => {
  const rows = await frame({ width: 104, height: 70 })
  expect(rows.some((line) => /v \/ V\s+Select by character \/ by line\s*$/.test(line))).toBe(true)
  expect(rows.some((line) => /\\\s+Toggle side by side \(120\+ columns\)\s*$/.test(line))).toBe(true)
  expect(rows.join("\n")).not.toContain("…")
})

for (const width of [85, 60]) {
  test(`at ${width} columns one column is drawn, inside the screen less its margin`, async () => {
    const rows = await frame({ version: "9.9.9", width, height: 40 })
    expect(rows.some((line) => line.includes("Move down / up") && line.includes("Toggle file tree"))).toBe(false)
    expect(rows.some((line) => /j \/ k\s+Move down \/ up/.test(line))).toBe(true)
    const inside = HELP_MARGIN + HELP_PADDING
    for (const line of rows.filter((line) => line.trim() !== "")) {
      expect(line.search(/\S/)).toBeGreaterThanOrEqual(inside)
      expect(line.length).toBeLessThanOrEqual(width - inside)
    }
    expect(rows.find((line) => line.includes("Keyboard Shortcuts"))).toContain("riff 9.9.9")
  })
}

test("at 60 columns, scrolled to the end, the one column reaches Quit", async () => {
  const rows = await frame({ width: 60, height: 40, scroll: helpViewport(40, 60).maxScroll })
  expect(rows.some((line) => /q\s+Quit/.test(line))).toBe(true)
  expect(rows.join("\n")).toContain("↑ more")
  expect(rows.join("\n")).not.toContain("↓ more")
})
