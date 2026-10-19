import { test, expect, afterEach } from "bun:test"
import { createPrInfoListIsland, type PrInfoListIsland } from "./pr-info-lists"
import { fileRows } from "../components/pr-info-list-rows"
import { bgAt, fgAt, ints, mountRenderable } from "../testing/frame"
import { PR_FILES } from "../testing/pr-info-panel"
import { colors, theme } from "../theme"

let mounted: Awaited<ReturnType<typeof mountRenderable>> | null = null

afterEach(async () => {
  await mounted?.dispose()
  mounted = null
})

const rows = (selected: number, labels: ReadonlyMap<string, string> = new Map()) =>
  fileRows(PR_FILES, { selected, labels, listWidth: 93 })

async function mountIsland() {
  let island!: PrInfoListIsland
  mounted = await mountRenderable((renderer) => {
    island = createPrInfoListIsland(renderer)
    return island.host
  }, { width: 40, height: 4 })
  return { island, frame: () => mounted!.frame(), setup: mounted.setup }
}

test("a push draws a row per item, the selected one on surface0", async () => {
  const { island, frame, setup } = await mountIsland()
  island.update(rows(0))
  expect(await frame()).toBe(["src/greet.ts       +3    -1", "src/farewell.ts    +5    -0"].join("\n"))
  const spans = setup.captureSpans()
  expect(bgAt(spans, 0, 0)).toEqual(ints(theme.surface0))
  expect(bgAt(spans, 39, 0)).toEqual(ints(theme.surface0))
  expect(fgAt(spans, 0, 0)).toEqual(ints(theme.text))
  expect(fgAt(spans, 19, 0)).toEqual(ints(theme.green))
  expect(fgAt(spans, 25, 0)).toEqual(ints(theme.red))
  expect(fgAt(spans, 0, 1)).toEqual(ints(theme.subtext1))
})

test("a second push moves the selection onto the same row renderables, and labels a row", async () => {
  const { island, frame, setup } = await mountIsland()
  island.update(rows(0))
  await frame()
  const first = island.rowAt(0)
  const second = island.rowAt(1)

  island.update(rows(1, new Map([["files:1", "sd"]])))
  const lines = (await frame()).split("\n")
  expect(lines[1]).toBe("sd src/farewell.ts    +5    -0")
  expect(island.rowAt(0)).toBe(first)
  expect(island.rowAt(1)).toBe(second)
  const spans = setup.captureSpans()
  expect(bgAt(spans, 0, 0)).not.toEqual(ints(theme.surface0))
  expect(fgAt(spans, 0, 0)).toEqual(ints(theme.subtext1))
  expect(bgAt(spans, 0, 1)).toEqual(ints(theme.surface0))
  expect(fgAt(spans, 0, 1)).toEqual(ints(colors.flashLabel))
  expect(fgAt(spans, 3, 1)).toEqual(ints(theme.text))
})

test("the note stands alone when there are no rows, and is no row", async () => {
  const { island, frame } = await mountIsland()
  island.update(fileRows([], { selected: -1, labels: new Map(), listWidth: 93 }))
  expect(await frame()).toBe("No files changed")
  expect(island.rowAt(0)).toBeUndefined()
})

test("dispose destroys the host and leaves the screen empty", async () => {
  const { island, frame } = await mountIsland()
  island.update(rows(0))
  await frame()
  island.dispose()
  expect(island.host.isDestroyed).toBe(true)
  expect(await frame()).toBe("")
})
