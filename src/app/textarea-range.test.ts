import { expect, test } from "bun:test"
import { replaceTextRange } from "./textarea-range"

test("a range splice clamps to the text, is one replaceText, and leaves the cursor after the replacement", () => {
  const replaced: string[] = []
  const textarea = {
    plainText: "hi @al there",
    cursorOffset: 0,
    replaceText(text: string) {
      replaced.push(text)
      this.plainText = text
    },
  }
  replaceTextRange(textarea, 3, 6, "@alice ")
  expect(replaced).toEqual(["hi @alice  there"])
  expect(textarea.cursorOffset).toBe(10)
  replaceTextRange(textarea, 100, 200, "!")
  expect(textarea.plainText).toBe("hi @alice  there!")
})
