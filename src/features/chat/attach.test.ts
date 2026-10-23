import { expect, test } from "bun:test"
import { onScreenToken, withToken } from "./attach"

test("the token goes in front of what is typed", () => {
  expect(withToken("", "@file")).toBe("@file ")
  expect(withToken("why this?", "@selection")).toBe("@selection why this?")
  expect(withToken("why this?", "@line")).toBe("@line why this?")
})

test("a token already in the input is not added again, @s counting as @selection", () => {
  expect(withToken("about @file, why?", "@file")).toBeNull()
  expect(withToken("@s why", "@selection")).toBeNull()
  expect(withToken("@selection", "@selection")).toBeNull()
  expect(withToken("@line why", "@line")).toBeNull()
  expect(withToken("@lines why", "@line")).toBe("@line @lines why")
  expect(withToken("@files why", "@file")).toBe("@file @files why")
  expect(withToken("@file why", "@selection")).toBe("@selection @file why")
})

test("the selection in visual mode, the cursor's line on a line, the file on a file header", () => {
  expect(onScreenToken(true, true)).toBe("@selection")
  expect(onScreenToken(false, true)).toBe("@line")
  expect(onScreenToken(false, false)).toBe("@file")
})
