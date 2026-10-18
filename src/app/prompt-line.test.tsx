import { test, expect, afterEach, describe } from "bun:test"
import { BoxRenderable, type Renderable } from "@opentui/core"
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing"
import { createFlashPromptIsland, createSearchPromptIsland } from "./prompt-line"
import { PromptInput, syncPromptSession, endPromptSession } from "../components/PromptInput"
import type { FlashPromptModel, SearchPromptModel } from "../components/prompt-line-model"
import { findText, trimFrame } from "../testing/frame"
import { fgAt, ints } from "../testing/split-frame"
import { theme } from "../theme"

let setup: TestRendererSetup | null = null

afterEach(() => {
  endPromptSession()
  setup?.renderer.destroy()
  setup = null
})

async function frame() {
  await setup!.renderOnce()
  await setup!.renderOnce()
  return trimFrame(setup!.captureCharFrame())
}

async function mount<T extends { host: Renderable }>(create: (renderer: TestRendererSetup["renderer"]) => T) {
  setup = await createTestRenderer({ width: 40, height: 1 })
  const island = create(setup.renderer)
  const parent = new BoxRenderable(setup.renderer, { width: "100%", height: 1 })
  setup.renderer.root.add(parent)
  parent.add(island.host)
  return island
}

const confirmed = (over: Partial<SearchPromptModel> = {}): SearchPromptModel => ({
  prefix: "/",
  typing: false,
  pattern: "foo",
  tone: "normal",
  loading: false,
  error: null,
  ...over,
})

describe("the search prompt", () => {
  test("a confirmed search draws its pattern behind / or ?", async () => {
    const search = await mount(createSearchPromptIsland)
    search.update(confirmed())
    expect(await frame()).toBe(" /foo")
    search.update(confirmed({ prefix: "?" }))
    expect(await frame()).toBe(" ?foo")
    search.dispose()
  })

  test("draws the prompt red in the error tone, and in the text colour otherwise", async () => {
    const search = await mount(createSearchPromptIsland)
    search.update(confirmed())
    await frame()
    expect(fgAt(setup!.captureSpans(), 1, 0)).toEqual(ints(theme.text))
    expect(fgAt(setup!.captureSpans(), 2, 0)).toEqual(ints(theme.text))
    search.update(confirmed({ tone: "error" }))
    await frame()
    expect(fgAt(setup!.captureSpans(), 1, 0)).toEqual(ints(theme.red))
    expect(fgAt(setup!.captureSpans(), 2, 0)).toEqual(ints(theme.red))
    search.dispose()
  })

  test("adds the loading and error suffixes in their own colours", async () => {
    const search = await mount(createSearchPromptIsland)
    search.update(confirmed({ loading: true }))
    expect(await frame()).toBe(" /foo Loading...")
    expect(fgAt(setup!.captureSpans(), 6, 0)).toEqual(ints(theme.subtext0))
    search.update(confirmed({ tone: "error", error: "Invalid regex" }))
    expect(await frame()).toBe(" /foo Invalid regex")
    expect(fgAt(setup!.captureSpans(), 6, 0)).toEqual(ints(theme.red))
    search.dispose()
  })

  test("draws nothing without a model", async () => {
    const search = await mount(createSearchPromptIsland)
    search.update(confirmed())
    await frame()
    search.update(null)
    expect(await frame()).toBe("")
    search.dispose()
  })

  test("while typing draws the field, and keeps the same live field across a confirm", async () => {
    const search = await mount(createSearchPromptIsland)
    syncPromptSession({ renderer: setup!.renderer, key: "search:forward:0:0", initialValue: "ba", onChange: () => {} })
    const field = PromptInput(setup!.renderer, "search")
    search.update(confirmed({ typing: true, pattern: "" }))
    expect(await frame()).toBe(" /ba")

    endPromptSession()
    search.update(confirmed({ pattern: "bar" }))
    expect(await frame()).toBe(" /bar")
    await new Promise((resolve) => setTimeout(resolve, 10))

    syncPromptSession({ renderer: setup!.renderer, key: "search:forward:1:0", initialValue: "", onChange: () => {} })
    search.update(confirmed({ typing: true, pattern: "bar" }))
    expect(await frame()).toBe(" /")
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(PromptInput(setup!.renderer, "search")).toBe(field)
    expect(field.isDestroyed).toBe(false)
    expect(field.parent).not.toBeNull()
    search.dispose()
  })

  test("while typing, the field takes the row and pushes the suffixes to its end", async () => {
    const search = await mount(createSearchPromptIsland)
    syncPromptSession({ renderer: setup!.renderer, key: "search:forward:0:0", initialValue: "ba", onChange: () => {} })
    search.update(confirmed({ typing: true, pattern: "", loading: true, tone: "error", error: "bad" }))
    expect(await frame()).toBe(" /ba" + " ".repeat(22) + "Loading... bad")
    search.dispose()
  })

  test("two islands on two renderers keep their own patterns", async () => {
    const screens = await Promise.all([0, 1].map(() => createTestRenderer({ width: 40, height: 1 })))
    const islands = screens.map((screen) => {
      const island = createSearchPromptIsland(screen.renderer)
      const parent = new BoxRenderable(screen.renderer, { width: "100%", height: 1 })
      screen.renderer.root.add(parent)
      parent.add(island.host)
      return island
    })
    const frameOf = async (screen: TestRendererSetup) => {
      await screen.renderOnce()
      await screen.renderOnce()
      return trimFrame(screen.captureCharFrame())
    }
    try {
      islands[0]!.update(confirmed({ pattern: "foo" }))
      expect(await frameOf(screens[0]!)).toBe(" /foo")
      islands[1]!.update(confirmed({ pattern: "bar", prefix: "?" }))
      expect(await frameOf(screens[1]!)).toBe(" ?bar")
      expect(await frameOf(screens[0]!)).toBe(" /foo")
    } finally {
      islands.forEach((island) => island.dispose())
      screens.forEach((screen) => screen.renderer.destroy())
    }
  })

  test("an identical update keeps the frame and the very renderables", async () => {
    const search = await mount(createSearchPromptIsland)
    search.update(confirmed())
    const before = await frame()
    const pattern = findText(search.host, "foo")
    expect(pattern).toBeDefined()
    search.update(confirmed())
    expect(await frame()).toBe(before)
    expect(findText(search.host, "foo")).toBe(pattern!)
    search.dispose()
  })
})

const flashing = (over: Partial<FlashPromptModel> = {}): FlashPromptModel => ({
  pattern: "",
  hint: "type to jump",
  noMatches: false,
  ...over,
})

describe("the flash prompt", () => {
  test("draws what is typed and the target hint", async () => {
    const flash = await mount(createFlashPromptIsland)
    flash.update(flashing())
    // The empty pattern still takes a cell between its two gaps.
    expect(await frame()).toBe(" flash   (type to jump)")
    flash.update(flashing({ pattern: "ab", hint: "3 targets" }))
    expect(await frame()).toBe(" flash ab (3 targets)")
    expect(fgAt(setup!.captureSpans(), 1, 0)).toEqual(ints(theme.mauve))
    expect(fgAt(setup!.captureSpans(), 7, 0)).toEqual(ints(theme.text))
    expect(fgAt(setup!.captureSpans(), 10, 0)).toEqual(ints(theme.overlay1))
    flash.update(flashing({ pattern: "zz", hint: "no targets", noMatches: true }))
    expect(await frame()).toBe(" flash zz (no targets)")
    expect(fgAt(setup!.captureSpans(), 7, 0)).toEqual(ints(theme.red))
    expect(fgAt(setup!.captureSpans(), 10, 0)).toEqual(ints(theme.red))
    flash.dispose()
  })

  test("draws nothing without a model", async () => {
    const flash = await mount(createFlashPromptIsland)
    flash.update(flashing())
    await frame()
    flash.update(null)
    expect(await frame()).toBe("")
    flash.dispose()
  })

  test("an identical update keeps the frame and the very renderables", async () => {
    const flash = await mount(createFlashPromptIsland)
    flash.update(flashing({ pattern: "ab", hint: "3 targets" }))
    const before = await frame()
    const pattern = findText(flash.host, "ab")
    expect(pattern).toBeDefined()
    flash.update(flashing({ pattern: "ab", hint: "3 targets" }))
    expect(await frame()).toBe(before)
    expect(findText(flash.host, "ab")).toBe(pattern!)
    flash.dispose()
  })
})
