import { describe, expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { theme } from "../../theme"
import { createChatAtPicker } from "./at-picker"
import type { AtCandidate } from "./at-candidates"

const CANDIDATES: AtCandidate[] = [
  { text: "@selection", keys: ["selection"] },
  { text: "@file", keys: ["file"] },
  { text: "@src/greet.ts", detail: "M  +1 -1", keys: ["greet.ts", "src/greet.ts"] },
]

function textarea(plainText: string) {
  return {
    plainText,
    cursorOffset: plainText.length,
    replaceText(text: string) {
      this.plainText = text
    },
  }
}

const picker = (input: () => ReturnType<typeof textarea> | null = () => null) =>
  createRoot(() => createChatAtPicker(() => CANDIDATES, input))

describe("the chat's @ picker", () => {
  test("opens on an @ at the start or after a space, and lists every candidate", () => {
    const at = picker()
    at.follow("why", 3)
    expect(at.view()).toBeNull()
    at.follow("why @", 5)
    expect(at.session()).toEqual({ query: "", atOffset: 4, selectedIndex: 0 })
    expect(at.view()).toEqual({
      kind: "rows",
      title: "@attach",
      accent: theme.blue,
      rows: CANDIDATES.map(({ text, detail }) => ({ text, fg: undefined, detail })),
      selected: 0,
    })
  })

  test("narrows on what is typed after the @, and says when nothing matches", () => {
    const at = picker()
    at.follow("@gre", 4)
    expect(at.candidates().map((c) => c.text)).toEqual(["@src/greet.ts"])
    at.follow("@xyz", 4)
    expect(at.view()).toEqual({ kind: "empty", text: "No match for @xyz" })
  })

  test("moves round the list, and clamps a selection the list shrank under", () => {
    const at = picker()
    at.follow("@", 1)
    at.move(-1)
    expect(at.view()).toMatchObject({ selected: 2 })
    at.move(1)
    expect(at.view()).toMatchObject({ selected: 0 })
    at.move(1)
    at.move(1)
    at.follow("@", 1)
    expect(at.view()).toMatchObject({ selected: 2 })
    at.follow("@gre", 4)
    expect(at.view()).toMatchObject({ selected: 0 })
  })

  test("accepts the selected token over the @ and its query, with a space after, and closes", () => {
    const input = textarea("see @fi")
    const at = picker(() => input)
    at.follow(input.plainText, input.cursorOffset)
    at.accept()
    expect(input.plainText).toBe("see @file ")
    expect(input.cursorOffset).toBe("see @file ".length)
    expect(at.open()).toBe(false)
  })

  test("closes on Esc, and a later edit still on the trigger opens it again", () => {
    const at = picker()
    at.follow("@g", 2)
    at.close()
    expect(at.view()).toBeNull()
    at.follow("@gr", 3)
    expect(at.open()).toBe(true)
    at.follow("@gr ", 4)
    expect(at.open()).toBe(false)
  })
})
