import { expect, test } from "bun:test"
import { createTestRenderer } from "@opentui/core/testing"
import { createLeave, leaveOnDestroy } from "./leave"

function recorder() {
  const calls: string[] = []
  return {
    calls,
    steps: {
      writeVisitWatermark: () => calls.push("watermark"),
      stopFocusReporting: () => calls.push("focus"),
      disposeChat: () => calls.push("chat"),
    },
  }
}

test("the first leave runs the watermark, focus and chat steps once, in that order", () => {
  const { calls, steps } = recorder()
  const leave = createLeave(steps)
  leave()
  expect(calls).toEqual(["watermark", "focus", "chat"])
})

test("a second leave runs nothing", () => {
  const { calls, steps } = recorder()
  const leave = createLeave(steps)
  leave()
  leave()
  expect(calls).toEqual(["watermark", "focus", "chat"])
})

test("focus reporting switched on after leave is built is still switched off", () => {
  const calls: string[] = []
  let stopFocusReporting: (() => void) | null = null
  const leave = createLeave({
    writeVisitWatermark: () => {},
    stopFocusReporting: () => stopFocusReporting?.(),
    disposeChat: () => {},
  })
  stopFocusReporting = () => calls.push("focus")
  leave()
  expect(calls).toEqual(["focus"])
})

test("destroying the renderer leaves once, and quit's own leave after it runs nothing", async () => {
  const { renderer } = await createTestRenderer({ width: 20, height: 4 })
  const { calls, steps } = recorder()
  const leave = createLeave(steps)
  leaveOnDestroy(renderer, leave)
  renderer.destroy()
  expect(calls).toEqual(["watermark", "focus", "chat"])
  leave()
  expect(calls).toEqual(["watermark", "focus", "chat"])
})

test("a watermark write that throws still lets focus and chat run, and is rethrown after them", () => {
  const { calls, steps } = recorder()
  const failed = new Error("disk full")
  const leave = createLeave({
    ...steps,
    writeVisitWatermark: () => {
      calls.push("watermark")
      throw failed
    },
  })
  expect(() => leave()).toThrow(failed)
  expect(calls).toEqual(["watermark", "focus", "chat"])
  leave()
  expect(calls).toEqual(["watermark", "focus", "chat"])
})

test("with two steps throwing, the first one's error is rethrown", () => {
  const first = new Error("watermark")
  const leave = createLeave({
    writeVisitWatermark: () => { throw first },
    stopFocusReporting: () => {},
    disposeChat: () => { throw new Error("chat") },
  })
  expect(() => leave()).toThrow(first)
})
