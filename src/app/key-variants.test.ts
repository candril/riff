import { test, expect } from "bun:test"
import { anyModifiers, without } from "./key-variants"

test("a bare key comes with every combination of ctrl, shift, meta, super and hyper", () => {
  const bindings = anyModifiers("y", "confirm.yes")
  const keys = bindings.map((b) => b.key)

  expect(bindings).toHaveLength(32)
  expect(new Set(keys).size).toBe(32)
  expect(bindings.every((b) => b.cmd === "confirm.yes")).toBe(true)
  expect(keys).toContain("y")
  expect(keys).toContain("ctrl+shift+y")
  expect(keys).toContain("super+y")
  expect(keys).toContain("hyper+y")
  expect(keys).toContain("ctrl+shift+meta+super+hyper+y")
})

test("a key that requires a modifier keeps it and varies only the others", () => {
  const keys = anyModifiers("ctrl+c", "flash.cancel").map((b) => b.key)

  expect(keys).toHaveLength(16)
  expect(new Set(keys).size).toBe(16)
  expect(keys.every((key) => key.startsWith("ctrl+"))).toBe(true)
  expect(keys).toContain("ctrl+c")
  expect(keys).toContain("ctrl+super+c")
  expect(keys).toContain("ctrl+shift+meta+super+hyper+c")
})

test("without drops every variant that holds one of the named modifiers", () => {
  const keys = without(["ctrl"], anyModifiers("j", "help.down")).map((b) => b.key)

  expect(keys).toHaveLength(16)
  expect(keys.some((key) => key.split("+").includes("ctrl"))).toBe(false)
  expect(keys).toContain("j")
  expect(keys).toContain("shift+meta+super+hyper+j")
  expect(without(["ctrl", "meta"], anyModifiers("return", "x"))).toHaveLength(8)
})

test("the plus key is a name, alone or after a modifier, and not a separator", () => {
  const keys = anyModifiers("+", "react").map((b) => b.key)

  expect(keys).toHaveLength(32)
  expect(keys).toContain("+")
  expect(keys).toContain("ctrl++")
  expect(keys).toContain("ctrl+shift+meta+super+hyper++")
  expect(anyModifiers("ctrl++", "react").map((b) => b.key)).toHaveLength(16)
  expect(without(["ctrl"], anyModifiers("+", "react"))).toHaveLength(16)
})
