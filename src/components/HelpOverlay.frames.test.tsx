import { test, expect, afterEach } from "bun:test"
import { mountJsx } from "../testing/frame"
import { HelpOverlay } from "./HelpOverlay"
import { helpOverlayModel } from "./help-overlay-model"

let mounted: Awaited<ReturnType<typeof mountJsx>> | null = null

async function frame(version?: string) {
  mounted = await mountJsx(() => <HelpOverlay model={helpOverlayModel(version)} />, { width: 110, height: 70 })
  return (await mounted.frame()).split("\n")
}

async function titleRow(version?: string) {
  const row = (await frame(version)).find((line) => line.includes("Keyboard Shortcuts"))
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
  expect(publish).toBeGreaterThan(-1)
  expect(newline).toBeGreaterThan(-1)
  expect(footer).toBeGreaterThan(Math.max(publish, newline))
})
