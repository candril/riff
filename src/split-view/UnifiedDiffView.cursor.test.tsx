import { test, expect, afterEach, spyOn } from "bun:test"
import { TWO_FILES } from "../testing/diffs"
import { mountUnified, type MountUnifiedOptions } from "../testing/unified-frame"

/*
 * The terminal's own cursor, which no frame shows: the renderer keeps
 * where it goes beside the buffer, so these read it back from there.
 */

let mounted: Awaited<ReturnType<typeof mountUnified>> | null = null

afterEach(async () => {
  await mounted?.dispose()
  mounted = null
})

async function mount(options: Omit<MountUnifiedOptions, "raw">) {
  mounted = await mountUnified({ raw: TWO_FILES, header: true, ...options })
  await mounted.frame()
  return mounted
}

const cursorOf = (view: NonNullable<typeof mounted>) => {
  const { x, y, visible, style, blinking } = view.setup.renderer.getCursorState()
  return { x, y, visible, style, blinking }
}

// TWO_FILES's code starts at x=5, and the header row puts mapping line n on screen row n + 1; the terminal counts from 1.
test("a block on the cursor's cell, under the header row", async () => {
  const view = await mount({ cursor: { line: 4, col: 3 } })
  expect(cursorOf(view)).toEqual({ x: 5 + 3 + 1, y: 4 + 1 + 1, visible: true, style: "block", blinking: false })
})

test("a column change alone moves it, the view asking for the frame no segment would", async () => {
  const view = await mount({ cursor: { line: 4, col: 3 } })
  const requestRender = spyOn(view.setup.renderer, "requestRender")
  view.set("cursor", "col", 6)
  expect(requestRender).toHaveBeenCalled()
  await view.setup.renderOnce()
  expect(cursorOf(view)).toMatchObject({ x: 5 + 6 + 1, y: 6, visible: true })
  requestRender.mockRestore()
})

test("unfocused, it leaves the cursor where its owner put it", async () => {
  const view = await mount({ cursor: { line: 4, col: 3 } })
  view.set("focused", false)
  view.setup.renderer.setCursorPosition(40, 9, true)
  view.set("cursor", "line", 2)
  await view.setup.renderOnce()
  expect(cursorOf(view)).toMatchObject({ x: 40, y: 9, visible: true })
})

test("off screen, it is hidden", async () => {
  const view = await mount({ cursor: { line: 4, col: 3 }, height: 4 })
  expect(cursorOf(view).visible).toBe(false)
})

test("disposed, it is hidden", async () => {
  const view = await mount({ cursor: { line: 4, col: 3 } })
  expect(cursorOf(view).visible).toBe(true)
  view.unmount()
  expect(cursorOf(view).visible).toBe(false)
})
