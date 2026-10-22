import { afterEach, expect, mock, test } from "bun:test"
import { setEmojiPicker, setMentionPicker } from "../state"
import { filterEmoji } from "../utils/emoji"
import { composing, overlay, send } from "../testing/composer-keys"

let dispose: (() => Promise<void>) | null = null
afterEach(async () => {
  mock.restore()
  await dispose?.()
  dispose = null
})

async function composer() {
  const opened = await composing()
  opened.app.mentions.merge(["dana", "dave"])
  dispose = opened.app.dispose
  return opened
}

type Opened = Awaited<ReturnType<typeof composer>>

// The two pickers answer the same keys (spec 082), so each case runs on both.
const pickers = [
  {
    name: "emoji",
    typed: "hi :smil",
    nothing: "hi :zzzq",
    accepted: () => `hi ${filterEmoji("smil")[1]!.char} `,
    selected: (opened: Opened) => overlay(opened.app).emojiPicker?.selectedIndex,
  },
  {
    name: "mention",
    typed: "ask @da",
    nothing: "ask @zzzq",
    accepted: () => "ask @dave ",
    selected: (opened: Opened) => overlay(opened.app).mentionPicker?.selectedIndex,
  },
] as const

const isOpen = (opened: Opened, name: string) =>
  (name === "emoji" ? overlay(opened.app).emojiPicker : overlay(opened.app).mentionPicker) !== null

for (const picker of pickers) {
  test(`the ${picker.name} picker: down, Ctrl-n, up and Ctrl-p move the selection`, async () => {
    const opened = await composer()
    await opened.app.setup.mockInput.typeText(picker.typed)
    expect(picker.selected(opened)).toBe(0)

    opened.app.setup.mockInput.pressArrow("down")
    expect(picker.selected(opened)).toBe(1)
    opened.app.setup.mockInput.pressKey("n", { ctrl: true })
    expect(picker.selected(opened)).toBe(picker.name === "mention" ? 0 : 2)
    opened.app.setup.mockInput.pressArrow("up")
    opened.app.setup.mockInput.pressKey("p", { ctrl: true })
    expect(picker.selected(opened)).toBe(0)
    expect(overlay(opened.app).mode).toBe("compose")
    expect(opened.app.ctx.getState().comments).toEqual([])
  })

  for (const [label, press] of [
    ["Tab", "\t"],
    ["Enter", "\r"],
  ] as const) {
    test(`the ${picker.name} picker: ${label} accepts the selected match`, async () => {
      const opened = await composer()
      await opened.app.setup.mockInput.typeText(picker.typed)
      opened.app.setup.mockInput.pressArrow("down")
      const key = send(opened.app, press)
      await opened.app.frame()

      expect(key.defaultPrevented).toBe(true)
      expect(opened.textarea.plainText).toBe(picker.accepted())
      expect(isOpen(opened, picker.name)).toBe(false)
      expect(overlay(opened.app).mode).toBe("compose")
      expect(opened.app.ctx.getState().comments).toEqual([])
    })
  }

  test(`the ${picker.name} picker: a key named enter accepts too`, async () => {
    const opened = await composer()
    await opened.app.setup.mockInput.typeText(picker.typed)
    opened.app.setup.mockInput.pressArrow("down")
    send(opened.app, "\r", "enter")
    await opened.app.frame()

    expect(opened.textarea.plainText).toBe(picker.accepted())
  })

  test(`the ${picker.name} picker: Esc closes only the picker`, async () => {
    const opened = await composer()
    await opened.app.setup.mockInput.typeText(picker.typed)
    // Meta held as well: the chain matched Esc by its name alone.
    send(opened.app, "\x1b[27;3u")

    expect(isOpen(opened, picker.name)).toBe(false)
    expect(overlay(opened.app).mode).toBe("compose")
    expect(opened.textarea.plainText).toBe(picker.typed)
    expect(opened.settled).toEqual([])
  })

  test(`the ${picker.name} picker with no match: Enter saves the comment`, async () => {
    const opened = await composer()
    await opened.app.setup.mockInput.typeText(picker.nothing)
    expect(isOpen(opened, picker.name)).toBe(true)
    send(opened.app, "\r")

    expect(overlay(opened.app).mode).toBe("view")
    expect(opened.app.ctx.getState().comments.map((c) => c.body)).toEqual([picker.nothing])
    expect(opened.settled).toEqual(["saved"])
  })

  test(`the ${picker.name} picker with no match: Tab is left to the textarea`, async () => {
    const opened = await composer()
    await opened.app.setup.mockInput.typeText(picker.nothing)
    const key = send(opened.app, "\t")

    expect(key.defaultPrevented).toBe(false)
    expect(overlay(opened.app).mode).toBe("compose")
    expect(isOpen(opened, picker.name)).toBe(true)
  })

  test(`the ${picker.name} picker with no match: down is still the picker's`, async () => {
    const opened = await composer()
    await opened.app.setup.mockInput.typeText(picker.nothing)
    const key = send(opened.app, "\x1b[B")

    expect(key.defaultPrevented).toBe(true)
    expect(picker.selected(opened)).toBe(0)
  })
}

test("the emoji picker shows its matches as rows under the composer", async () => {
  const opened = await composer()
  await opened.app.setup.mockInput.typeText("hi :smil")
  opened.app.setup.mockInput.pressArrow("down")
  const frame = await opened.app.frame()
  expect(frame).toMatch(/😃 +:smiley:/)
  expect(frame).toContain("Tab/⏎ accept")
})

test("with both pickers set, the emoji picker takes the keys", async () => {
  const opened = await composer()
  const { app } = opened
  await app.setup.mockInput.typeText("hi :smil")
  app.ctx.setState((s) => setMentionPicker(s, { query: "da", atOffset: 0 }))
  expect(overlay(app).emojiPicker).not.toBeNull()

  app.setup.mockInput.pressArrow("down")
  expect(overlay(app).emojiPicker?.selectedIndex).toBe(1)
  expect(overlay(app).mentionPicker?.selectedIndex).toBe(0)

  send(app, "\x1b")
  expect(overlay(app).emojiPicker).toBeNull()
  expect(overlay(app).mentionPicker).not.toBeNull()
  expect(overlay(app).mode).toBe("compose")
})

test("with both pickers set and no emoji to accept, Tab accepts the mention", async () => {
  const opened = await composer()
  const { app } = opened
  await app.setup.mockInput.typeText("ask @da")
  app.ctx.setState((s) => setEmojiPicker(s, { query: "zzzq", colonOffset: 0 }))
  send(app, "\t")
  await app.frame()

  expect(opened.textarea.plainText).toBe("ask @dana ")
})
