import { test, expect } from "bun:test"
import { isOpenableUrl } from "./open-url"
import { BOARD_SCHEMES } from "../features/riff-board"

test("only the web opens by default: a link in a comment cannot launch an app", () => {
  expect(isOpenableUrl("https://github.com/owner/repo/pull/1")).toBe(true)
  expect(isOpenableUrl("riff-board:/pr/owner/repo/1")).toBe(false)
  expect(isOpenableUrl("file:///etc/passwd")).toBe(false)
})

test("riff board's link opens where the board's schemes are allowed, and nothing else does", () => {
  expect(isOpenableUrl("riff-board:/pr/owner/repo/1", BOARD_SCHEMES)).toBe(true)
  expect(isOpenableUrl("file:///etc/passwd", BOARD_SCHEMES)).toBe(false)
})
