import { afterEach, describe, expect, test } from "bun:test"
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing"
import { createChatColumnIsland } from "./chat-column"
import { fakeAgent } from "../features/chat/fake-agent"
import { createChatState } from "../features/chat/state"
import { CHAT_HINT } from "../features/chat/ChatPane"
import type { AtCandidate } from "../features/chat/at-candidates"
import { theme } from "../theme"
import { bgAt, ints, trimFrame } from "../testing/frame"

const HEIGHT = 20

let teardown: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const dispose of teardown) await dispose()
  teardown = []
})

async function mountColumn(width: number, focused = true, atCandidates: AtCandidate[] = []) {
  const setup = await createTestRenderer({ width, height: HEIGHT })
  const fake = fakeAgent()
  const state = createChatState(fake.agent)
  const island = createChatColumnIsland(setup.renderer, state, () => atCandidates)
  teardown.push(async () => {
    await setup.waitForVisualIdle().catch(() => {})
    island.dispose()
    setup.renderer.destroy()
  })
  setup.renderer.root.add(island.host)
  island.update({ width, focused })
  return { setup, island, fake, state }
}

async function draw(setup: TestRendererSetup) {
  await setup.renderOnce()
  await setup.renderOnce()
  return trimFrame(setup.captureCharFrame())
}

/** The frame's text with its line wrapping undone, so a sentence can be looked for at any width. */
const flat = (frame: string) => frame.split("\n").map((line) => line.trim()).join(" ").replace(/\s+/g, " ")

for (const width of [50, 36]) {
  describe(`at ${width} columns`, () => {
    test("an empty conversation says what can be done, with nothing on the status line", async () => {
      const { setup } = await mountColumn(width)
      const frame = await draw(setup)
      expect(flat(frame)).toContain(CHAT_HINT)
      expect(frame).toContain("Ask about this review")
      expect(frame).not.toMatch(/thinking|answering/)
      expect(frame).not.toMatch(/[│─┌┐└┘╭╮╰╯]/)
    })

    test("a question, then a partial answer streaming in under it", async () => {
      const { setup, state, fake } = await mountColumn(width)
      state.send("why is this async?")
      const thinking = await draw(setup)
      expect(thinking).toContain("› why is this async?")
      expect(thinking).toMatch(/thinking \d+s/)
      expect(flat(thinking)).not.toContain(CHAT_HINT)

      fake.events().text("Because the read ")
      const streaming = await draw(setup)
      expect(streaming).toContain("Because the read")
      expect(streaming).toMatch(/answering \d+s/)
    })

    test("a finished answer is drawn as markdown, and the status line empties", async () => {
      const { setup, state, fake } = await mountColumn(width)
      state.send("where?")
      fake.answer("It is read twice:\n\n- in `src/app.ts:42`\n- in **render**")
      const frame = await draw(setup)
      expect(frame).toContain("It is read twice:")
      expect(frame).toContain("- in src/app.ts:42")
      expect(frame).not.toContain("`")
      expect(frame).toContain("in render")
      expect(frame).not.toContain("**")
      expect(frame).not.toMatch(/thinking|answering/)
    })

    test("questions asked during an answer wait, and the status line counts them", async () => {
      const { setup, state } = await mountColumn(width)
      state.send("one")
      state.send("two")
      state.send("three")
      const frame = await draw(setup)
      expect(frame).toContain("› two  (waiting)")
      expect(frame).toContain("› three  (waiting)")
      expect(frame).toMatch(/thinking \d+s · 2 waiting/)
    })

    test("a failure is a note in the conversation, not the status line", async () => {
      const { setup, state, fake } = await mountColumn(width)
      state.send("one")
      fake.events().failed({ kind: "not-logged-in" })
      const frame = await draw(setup)
      expect(flat(frame)).toContain("Not logged in to Claude. Run `claude login`, then ask again.")
      expect(frame).not.toMatch(/thinking|answering/)
    })

    test("the input is one line high, grows with what is typed and stops at six", async () => {
      const { setup, island } = await mountColumn(width)
      await draw(setup)
      const input = island.input()!
      expect(input.height).toBe(1)
      input.setText("a\nb\nc")
      await draw(setup)
      expect(input.height).toBe(3)
      input.setText(["1", "2", "3", "4", "5", "6", "7", "8"].join("\n"))
      // Typing leaves the caret at the end, which is what scrolls the input.
      input.gotoBufferEnd()
      const frame = await draw(setup)
      expect(input.height).toBe(6)
      expect(frame).toContain("8")
      expect(frame).not.toMatch(/^\s*1$/m)
    })

    test("past six typed lines the input scrolls, so the last line and the cursor stay on screen", async () => {
      const { setup, island } = await mountColumn(width)
      await draw(setup)
      const input = island.input()!
      for (let line = 1; line <= 8; line++) {
        if (line > 1) input.newLine()
        await setup.mockInput.typeText(`line ${line}`)
      }
      const frame = await draw(setup)
      const rows = frame.split("\n")
      const last = rows.findIndex((row) => row.includes("line 8"))
      expect(input.height).toBe(6)
      expect(last).toBeGreaterThan(-1)
      expect(frame).not.toContain("line 2")
      const cursor = setup.renderer.getCursorState()
      // The renderer's cursor is 1-based.
      expect([cursor.visible, cursor.y - 1, cursor.x - 1]).toEqual([true, last, rows[last]!.indexOf("line 8") + "line 8".length])
    })
  })
}

describe("the input's shade says whether the chat has the keys", () => {
  const inputRow = HEIGHT - 2

  test("on surface0 while focused, on the column's mantle otherwise, with no other shade", async () => {
    const { setup, island, state } = await mountColumn(50, true)
    await draw(setup)
    const focused = setup.captureSpans()
    expect(bgAt(focused, 4, inputRow)).toEqual(ints(theme.surface0))
    expect(bgAt(focused, 4, 2)).toEqual(ints(theme.mantle))

    island.update({ width: 50, focused: false })
    await draw(setup)
    const idle = setup.captureSpans()
    expect(bgAt(idle, 4, inputRow)).toEqual(ints(theme.mantle))
    for (let x = 0; x < 50; x++) expect(bgAt(idle, x, inputRow)).toEqual(ints(theme.mantle))
  })

  test("the column hides with its host and shows its conversation when opened again", async () => {
    const { setup, island, state } = await mountColumn(50)
    state.send("kept")
    await draw(setup)
    island.update(null)
    expect(island.host.visible).toBe(false)
    expect(await draw(setup)).not.toContain("kept")
    island.update({ width: 50, focused: true })
    expect(await draw(setup)).toContain("› kept")
  })
})

test("a drifted claude's note is there when the column opens, before anything is asked", async () => {
  const { setup, island, state } = await mountColumn(50)
  island.update(null)
  const drift = "claude 2.2.0 is installed; riff's agent is built for 2.1.296 and may not work until they match"
  state.note(drift, "info")
  island.update({ width: 50, focused: true })
  expect(flat(await draw(setup))).toContain(drift)
})

describe("an @ in the input floats the picker of what it can attach just above it", () => {
  const CANDIDATES: AtCandidate[] = [
    { text: "@selection", keys: ["selection"] },
    { text: "@file", keys: ["file"] },
    { text: "@src/greet.ts", detail: "M  +1 -1", keys: ["greet.ts", "src/greet.ts"] },
    { text: "@src/sum.ts", detail: "A  +3 -0", keys: ["sum.ts", "src/sum.ts"] },
  ]
  const inputRow = HEIGHT - 2

  test("titled @attach, a row per candidate with its status and line counts, the first selected, and the keys under them", async () => {
    const { setup, island } = await mountColumn(50, true, CANDIDATES)
    await draw(setup)
    await setup.mockInput.typeText("@")
    const frame = await draw(setup)
    const rows = frame.split("\n")
    expect(rows[inputRow]).toContain("@")
    const footer = rows.findIndex((row) => row.includes("↑↓ nav  Tab/⏎ accept  Esc dismiss"))
    // The input box's top padding sits between the picker and the typed line.
    expect(footer).toBe(inputRow - 2)
    const picker = rows.slice(footer - 5, footer).map((row) => row.trim())
    expect(picker[0]).toBe("@attach")
    expect(picker[1]).toEndWith("▸ @selection")
    expect(picker[2]).toEndWith("@file")
    expect(picker[3]).toMatch(/@src\/greet\.ts +M {2}\+1 -1$/)
    expect(picker[4]).toMatch(/@src\/sum\.ts +A {2}\+3 -0$/)
    const spans = setup.captureSpans()
    const selected = footer - 4
    expect(bgAt(spans, 4, selected)).toEqual(ints(theme.surface0))
    expect(bgAt(spans, 4, selected + 1)).toEqual(ints(theme.mantle))
    expect(frame).not.toMatch(/[│─┌┐└┘╭╮╰╯]/)
    expect(island.atPicker.session()).toEqual({ query: "", atOffset: 0, selectedIndex: 0 })
  })

  test("a query nothing matches says so, in the same place", async () => {
    const { setup } = await mountColumn(50, true, CANDIDATES)
    await draw(setup)
    await setup.mockInput.typeText("@xyz")
    const frame = await draw(setup)
    const rows = frame.split("\n")
    expect(rows[inputRow - 2]).toContain("No match for @xyz")
    expect(frame).not.toContain("@attach")
  })
})
