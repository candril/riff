import { expect, test } from "bun:test"
import { chatColumnWidth } from "./width"

test("the chat column aims for 56 columns, takes at most 40% of the screen and never fewer than 40", () => {
  expect(chatColumnWidth(80)).toBe(40)
  expect(chatColumnWidth(120)).toBe(48)
  expect(chatColumnWidth(140)).toBe(56)
  expect(chatColumnWidth(300)).toBe(56)
})
