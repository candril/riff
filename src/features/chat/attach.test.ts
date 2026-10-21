import { expect, test } from "bun:test"
import { withToken } from "./attach"

test("the token goes in front of what is typed", () => {
  expect(withToken("", "@file")).toBe("@file ")
  expect(withToken("why this?", "@selection")).toBe("@selection why this?")
})

test("a token already in the input is not added again, @s counting as @selection", () => {
  expect(withToken("about @file, why?", "@file")).toBeNull()
  expect(withToken("@s why", "@selection")).toBeNull()
  expect(withToken("@selection", "@selection")).toBeNull()
  expect(withToken("@files why", "@file")).toBe("@file @files why")
  expect(withToken("@file why", "@selection")).toBe("@selection @file why")
})
