import { expect, test } from "bun:test"
import { statusLineText } from "./status-line"

test("names the phase, the seconds since the question went out, and the queue", () => {
  expect(statusLineText({ phase: "thinking", startedAt: 0, waiting: 0 }, null, 3400)).toBe("thinking 3s")
  expect(statusLineText({ phase: "answering", startedAt: 0, waiting: 2 }, null, 5000)).toBe("answering 5s · 2 waiting")
})

test("says nothing when idle, and a pending confirmation wins over the activity", () => {
  expect(statusLineText(null, null, 0)).toBe("")
  expect(statusLineText({ phase: "thinking", startedAt: 0, waiting: 0 }, "Press it again", 0)).toBe("Press it again")
})
