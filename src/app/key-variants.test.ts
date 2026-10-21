import { test, expect } from "bun:test"
import { anyModifiers } from "./key-variants"

test("a bare key comes with every combination of ctrl, shift and meta", () => {
  expect(anyModifiers("y", "confirm.yes")).toEqual([
    { key: "y", cmd: "confirm.yes" },
    { key: "ctrl+y", cmd: "confirm.yes" },
    { key: "shift+y", cmd: "confirm.yes" },
    { key: "ctrl+shift+y", cmd: "confirm.yes" },
    { key: "meta+y", cmd: "confirm.yes" },
    { key: "ctrl+meta+y", cmd: "confirm.yes" },
    { key: "shift+meta+y", cmd: "confirm.yes" },
    { key: "ctrl+shift+meta+y", cmd: "confirm.yes" },
  ])
})

test("a key that requires a modifier keeps it and varies only the others", () => {
  expect(anyModifiers("ctrl+c", "flash.cancel").map((b) => b.key)).toEqual([
    "ctrl+c",
    "ctrl+shift+c",
    "ctrl+meta+c",
    "ctrl+shift+meta+c",
  ])
})
