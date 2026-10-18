import { test, expect, afterEach } from "bun:test"
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing"
import {
  endReviewSummarySession,
  getReviewSummaryRenderable,
  readReviewSummaryValue,
  syncReviewSummarySession,
} from "./ReviewSummaryComposer"

const setups: TestRendererSetup[] = []

afterEach(() => {
  endReviewSummarySession()
  for (const setup of setups.splice(0)) setup.renderer.destroy()
})

async function renderer() {
  const setup = await createTestRenderer({ width: 80, height: 24 })
  setups.push(setup)
  return setup.renderer
}

test("each renderer gets a textarea of its own, and the same one every time", async () => {
  const first = await renderer()
  const second = await renderer()
  const textarea = getReviewSummaryRenderable(first)
  expect(getReviewSummaryRenderable(first)).toBe(textarea)
  expect(getReviewSummaryRenderable(second)).not.toBe(textarea)
})

test("a session on a second renderer survives the first one being destroyed", async () => {
  const first = await renderer()
  const second = await renderer()
  syncReviewSummarySession(first, "review-preview-open", "On the first", true, () => {})
  endReviewSummarySession()
  first.destroy()

  const mirrored: string[] = []
  syncReviewSummarySession(second, "review-preview-open", "On the second", true, (value) => mirrored.push(value))
  const textarea = getReviewSummaryRenderable(second)
  expect(textarea.isDestroyed).toBe(false)
  expect(textarea.focused).toBe(true)
  expect(readReviewSummaryValue()).toBe("On the second")

  textarea.insertText("!")
  // The textarea reports content changes asynchronously.
  await Bun.sleep(10)
  expect(mirrored.at(-1)).toBe("!On the second")
  expect(readReviewSummaryValue()).toBe("!On the second")
})

test("reads the open session's text, and nothing once it ends", async () => {
  const first = await renderer()
  const second = await renderer()
  getReviewSummaryRenderable(first).setText("Stale")
  syncReviewSummarySession(second, "review-preview-open", "Seeded", false, () => {})
  expect(readReviewSummaryValue()).toBe("Seeded")
  // A re-render with the same key keeps what is typed.
  getReviewSummaryRenderable(second).setText("Typed")
  syncReviewSummarySession(second, "review-preview-open", "Seeded", true, () => {})
  expect(readReviewSummaryValue()).toBe("Typed")

  endReviewSummarySession()
  expect(getReviewSummaryRenderable(second).focused).toBe(false)
  expect(readReviewSummaryValue()).toBe("")
})
