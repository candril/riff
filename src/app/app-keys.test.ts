import { expect, test } from "bun:test"
import type { KeyEvent, Renderable } from "@opentui/core"
import type { Keymap } from "@opentui/keymap"
import { APP_KEYS, appKeyTakes, registerAppKeys } from "./app-keys"

function boundNames(): string[] {
  let bindings: { key: string }[] = []
  const keymap = {
    registerLayer: (layer: { bindings: { key: string }[] }) => {
      bindings = layer.bindings
      return () => {}
    },
  } as unknown as Keymap<Renderable, KeyEvent>
  registerAppKeys(keymap, { toggleConsole: () => {} })
  return [...new Set(bindings.map(({ key }) => key.split("+").at(-1)!))]
}

test("appKeyTakes accepts exactly the names the app layer binds", () => {
  const bound = boundNames()
  expect(bound.sort()).toEqual(Object.keys(APP_KEYS).sort())
  for (const name of [...bound, "f11", "f1", "g", "escape", "return", "toString"]) {
    expect(appKeyTakes({ name })).toBe(bound.includes(name))
  }
})
