import { expect, test } from "bun:test"
import { chatColumnWidth } from "./width"

test("the chat column aims for 56 columns, takes at most 40% of the screen and never fewer than 40", () => {
  expect(chatColumnWidth(80, false)).toBe(40)
  expect(chatColumnWidth(120, false)).toBe(48)
  expect(chatColumnWidth(140, false)).toBe(56)
  expect(chatColumnWidth(300, false)).toBe(56)
})

test("the expanded chat column aims for 88 columns, takes at most 60% of the screen and never fewer than 40", () => {
  expect(chatColumnWidth(80, true)).toBe(48)
  expect(chatColumnWidth(120, true)).toBe(72)
  expect(chatColumnWidth(140, true)).toBe(84)
  expect(chatColumnWidth(300, true)).toBe(88)
})

test("from 100 columns up the expanded chat column is wider than the normal one", () => {
  for (let screen = 100; screen <= 400; screen++) {
    expect(chatColumnWidth(screen, true)).toBeGreaterThan(chatColumnWidth(screen, false))
  }
})
