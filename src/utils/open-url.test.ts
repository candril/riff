import { test, expect } from "bun:test"
import { isOpenableUrl, openCommand } from "./open-url"
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

const PR = "https://github.com/owner/repo/pull/1"

test("a configured browser opens web links directly, past whatever handles them by default", () => {
  expect(openCommand(PR, "Helium", "darwin")).toEqual(["open", "-a", "Helium", PR])
})

test("without a configured browser the desktop decides", () => {
  expect(openCommand(PR, undefined, "darwin")).toEqual(["open", PR])
  expect(openCommand(PR, "", "darwin")).toEqual(["open", PR])
})

test("riff board's app scheme ignores the configured browser", () => {
  expect(openCommand("riff-board:/pr/owner/repo/1", "Helium", "darwin")).toEqual(["open", "riff-board:/pr/owner/repo/1"])
})

test("the browser setting only applies on macOS", () => {
  expect(openCommand(PR, "Helium", "linux")).toEqual(["xdg-open", PR])
})
