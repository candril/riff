import { afterEach, expect, mock, test } from "bun:test"
import { trimFrame } from "../testing/frame"
import { composing } from "../testing/composer-keys"

let dispose: (() => Promise<void>) | null = null
afterEach(async () => {
  mock.restore()
  await dispose?.()
  dispose = null
})

/** Whether the emoji picker's title sits below the thread panel's header in `frame`. */
function pickerBelowHeader(frame: string): boolean {
  const rows = trimFrame(frame).split("\n")
  const header = rows.findIndex((row) => row.includes("Composing"))
  const title = rows.findIndex((row) => row.trimEnd().endsWith(":emoji"))
  return header > -1 && title > header
}

/*
 * The frame pass can run before the layout that follows a change: a riff
 * key redraws at once, and a resize across the split threshold redraws from
 * the resize event. The picker's room has to come from that frame, not from
 * the composer's last position.
 */

test("at 120x24, a draft grown by eight lines under an open :s picker keeps the picker below the header in the first frame", async () => {
  const { app, textarea } = await composing({}, { width: 120, height: 24 })
  dispose = app.dispose
  await app.setup.mockInput.typeText(":s")
  expect(pickerBelowHeader(await app.frame())).toBe(true)

  textarea.cursorOffset = 0
  textarea.insertText(Array.from({ length: 8 }, (_, i) => `line ${i + 1}\n`).join(""))
  textarea.cursorOffset = textarea.plainText.length
  app.render()
  await app.setup.renderOnce()

  const frame = app.setup.captureCharFrame()
  expect(frame).toContain("line 8")
  expect(pickerBelowHeader(frame)).toBe(true)
})

test("resized from split to unified with :s open, the picker keeps below the header in the first frame", async () => {
  const { app } = await composing({}, { width: 220, height: 30 })
  dispose = app.dispose
  app.diffOptions.toggleSplit()
  await app.setup.mockInput.typeText(":s")
  expect(pickerBelowHeader(await app.frame())).toBe(true)

  app.setup.resize(110, 14)
  await app.setup.renderOnce()

  expect(pickerBelowHeader(app.setup.captureCharFrame())).toBe(true)
})
