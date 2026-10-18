import { test, expect, afterEach } from "bun:test"
import { mountJsx } from "../testing/frame"
import { HelpOverlay } from "./HelpOverlay"
import { helpOverlayModel } from "./help-overlay-model"
import { helpViewport } from "./help-sections"

let mounted: Awaited<ReturnType<typeof mountJsx>> | null = null

const FOOTER = /Press g\? or Esc to close|j \/ k scroll · g\? or Esc to close/

/** The overlay centred on a screen of its own, as the island places it. */
async function frame({ version, scroll = 0, width = 110, height = 70 }: { version?: string; scroll?: number; width?: number; height?: number } = {}) {
  mounted = await mountJsx(
    () => (
      <box width="100%" height="100%" justifyContent="center" alignItems="center">
        <HelpOverlay model={helpOverlayModel(version, scroll, height)} />
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
  const pick = rows.findIndex((line) => /Tab \/ Enter\s+Pick in a picker/.test(line))
  expect(publish).toBeGreaterThan(-1)
  expect(newline).toBeGreaterThan(-1)
  expect(pick).toBeGreaterThan(-1)
  expect(footer).toBeGreaterThan(Math.max(publish, newline, pick))
})

test("gB is drawn with riff board, above the footer", async () => {
  const rows = await frame()
  const board = rows.findIndex((line) => /gB\s+Open PR in riff board/.test(line))
  expect(board).toBeGreaterThan(-1)
  expect(rows.findIndex((line) => line.includes("Press g? or Esc to close"))).toBeGreaterThan(board)
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
  const rows = await frame({ width: 120, height: 40, scroll: helpViewport(40).maxScroll })
  const text = rows.join("\n")
  expect(rows.some((line) => /q\s+Quit/.test(line))).toBe(true)
  expect(text).not.toContain("Navigation")
  expect(text).toContain("↑ more")
  expect(text).not.toContain("↓ more")
})
