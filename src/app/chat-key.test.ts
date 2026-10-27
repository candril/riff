import { expect, test } from "bun:test"
import { chatKeyOf } from "./chat-key"

test("a --files target keeps its conversation apart from the uncommitted changes' and from another path's", () => {
  const plain = chatKeyOf("local", undefined)
  const dir = chatKeyOf("local", { path: "src", directory: true })
  const file = chatKeyOf("local", { path: "src/app.ts", directory: false })
  expect(plain).toBe("local")
  expect(new Set([plain, dir, file]).size).toBe(3)
  expect(chatKeyOf("local", { path: "src", directory: true })).toBe(dir)
})

test("without --files the chat is keyed by the review's source", () => {
  expect(chatKeyOf("@-", undefined)).toBe("@-")
  expect(chatKeyOf("gh:owner/repo#1", undefined)).toBe("gh:owner/repo#1")
})
