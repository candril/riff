import { afterEach, expect, test } from "bun:test"
import { TextareaRenderable } from "@opentui/core"
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing"
import { fakeAgent } from "./fake-agent"
import { handleChatKey } from "./keys"
import { createChatState, NEW_CONVERSATION_PROMPT } from "./state"

let setup: TestRendererSetup | null = null
afterEach(() => {
  setup?.renderer.destroy()
  setup = null
})

/** The chat's keys on a focused textarea, the way riff's key handler runs ahead of it. */
async function chat() {
  setup = await createTestRenderer({ width: 40, height: 6 })
  const input = new TextareaRenderable(setup.renderer, { width: 40, height: 3 })
  setup.renderer.root.add(input)
  input.focus()
  const fake = fakeAgent()
  const state = createChatState(fake.agent)
  const moves: string[] = []
  setup.renderer.keyInput.on("keypress", (key) =>
    handleChatKey(key, {
      state,
      input: () => input,
      focusDiff: () => moves.push("diff"),
      walkLeft: () => moves.push("left"),
    }),
  )
  return { keys: setup.mockInput, input, fake, state, moves }
}

// A lone ESC byte is held back a moment, in case it starts an escape sequence.
async function escape(keys: TestRendererSetup["mockInput"]) {
  keys.pressEscape()
  await Bun.sleep(50)
}

test("Enter sends the trimmed text and clears the input; an empty one is ignored", async () => {
  const { keys, input, fake } = await chat()
  keys.pressEnter()
  expect([fake.asked, input.plainText]).toEqual([[], ""])
  await keys.typeText("  what does this do? ")
  keys.pressEnter()
  expect(fake.asked).toEqual(["what does this do?"])
  expect(fake.positions).toEqual([null])
  expect(input.plainText).toBe("")
})

test("Ctrl-j breaks the line rather than sending", async () => {
  const { keys, input, fake } = await chat()
  await keys.typeText("one")
  keys.pressKey("\n")
  await keys.typeText("two")
  expect(input.plainText).toBe("one\ntwo")
  expect(fake.asked).toEqual([])
})

test("Esc stops an answer while one runs, and otherwise hands the keys back to the diff", async () => {
  const { keys, fake, state, moves } = await chat()
  await keys.typeText("q")
  keys.pressEnter()
  await escape(keys)
  expect([fake.interrupts(), moves]).toEqual([1, []])
  fake.events().answerDone({ interrupted: true })
  await escape(keys)
  expect([fake.interrupts(), moves, state.status()]).toEqual([1, ["diff"], "idle"])
})

test("Ctrl-n twice starts over; another key in between keeps the conversation", async () => {
  const { keys, fake, state } = await chat()
  await keys.typeText("q")
  keys.pressEnter()
  fake.answer("a")
  keys.pressKey("n", { ctrl: true })
  expect(state.clearPrompt()).toBe(NEW_CONVERSATION_PROMPT)
  await keys.typeText("x")
  expect(state.clearPrompt()).toBeNull()
  keys.pressKey("n", { ctrl: true })
  keys.pressKey("n", { ctrl: true })
  expect([state.entries.length, fake.closes()]).toEqual([0, 1])
})

test("backspace deletes while there is text, and walks left once the input is empty", async () => {
  const { keys, input, moves } = await chat()
  await keys.typeText("ab")
  keys.pressBackspace()
  expect([input.plainText, moves]).toEqual(["a", []])
  keys.pressBackspace()
  expect([input.plainText, moves]).toEqual(["", []])
  keys.pressBackspace()
  expect(moves).toEqual(["left"])
})
