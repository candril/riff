import { test, expect, afterEach } from "bun:test"
import { mountRenderable } from "../testing/frame"
import { HelpOverlay } from "./HelpOverlay"

let mounted: Awaited<ReturnType<typeof mountRenderable>> | null = null

async function titleRow(version?: string) {
  mounted = await mountRenderable(() => HelpOverlay({ version }), { width: 110, height: 70 })
  const row = (await mounted.frame()).split("\n").find((line) => line.includes("Keyboard Shortcuts"))
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
