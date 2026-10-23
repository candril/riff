import { afterEach, expect, mock, test } from "bun:test"
import { createInitialState } from "../state"
import { adoptReloadedState } from "../features/refresh/handlers"
import { reloadCtx } from "../testing/app-render"
import { ctrl } from "../testing/chat-keys"
import { composing, overlay, send } from "../testing/composer-keys"

let dispose: (() => Promise<void>) | null = null
afterEach(async () => {
  mock.restore()
  await dispose?.()
  dispose = null
})

async function composer() {
  const opened = await composing()
  dispose = opened.app.dispose
  return opened
}

type Opened = Awaited<ReturnType<typeof composer>>

const pickers = (opened: Opened) => [opened.app.composerPickers.mention(), opened.app.composerPickers.emoji()]

async function typingSmil(opened: Opened) {
  await opened.app.setup.mockInput.typeText("hi :smil")
  expect(opened.app.composerPickers.emoji()?.query).toBe("smil")
  const frame = await opened.app.frame()
  expect(frame).toMatch(/😃 +:smiley:/)
  expect(frame).toContain("Tab/⏎ accept")
}

/** `c` on the changed line again, from the diff. */
async function reopen(opened: Opened) {
  const { app } = opened
  if (app.ctx.getState().focusedPanel === "comments") ctrl(app, "h")
  app.setup.mockInput.pressKey("c")
  // The textarea reports its seeding a tick later, outside any pass.
  await Bun.sleep(10)
  expect(overlay(app).mode).toBe("compose")
  return app.frame()
}

test("Esc cancelling the composer leaves no picker for the composer reopened on the line", async () => {
  const opened = await composer()
  await typingSmil(opened)

  send(opened.app, "\x1b")
  send(opened.app, "\x1b")
  expect(overlay(opened.app).mode).toBe("view")
  expect(pickers(opened)).toEqual([null, null])

  const frame = await reopen(opened)
  expect(frame).not.toContain(":smiley:")
  expect(pickers(opened)).toEqual([null, null])
})

test("saving with an open picker that has no match closes the picker with the composer", async () => {
  const opened = await composer()
  await opened.app.setup.mockInput.typeText("hi :zzzq")
  expect(opened.app.composerPickers.emoji()).not.toBeNull()

  send(opened.app, "\r")
  expect(overlay(opened.app).mode).toBe("view")
  expect(pickers(opened)).toEqual([null, null])

  const frame = await reopen(opened)
  expect(frame).not.toContain("Tab/⏎ accept")
  expect(pickers(opened)).toEqual([null, null])
})

test("closing the panel clears the pickers, so the panel reopened on the line draws none", async () => {
  const opened = await composer()
  await typingSmil(opened)
  send(opened.app, "\x1b")
  send(opened.app, "\x1b")
  // Esc closes the picker before it reaches the composer, so no key leaves
  // one standing in view mode; set here, it shows the close clearing it.
  opened.app.composerPickers.setEmoji({ query: "smil", colonOffset: 3 })

  opened.app.setup.mockInput.pressKey("q")
  expect(overlay(opened.app).open).toBe(false)
  expect(pickers(opened)).toEqual([null, null])

  const frame = await reopen(opened)
  expect(frame).not.toContain(":smiley:")
  expect(pickers(opened)).toEqual([null, null])
})

test("a reload while the picker shows clears it with the panel the rebuild closes", async () => {
  const opened = await composer()
  await typingSmil(opened)
  const { app } = opened

  adoptReloadedState(reloadCtx(app), (prev) => createInitialState(prev.files, prev.fileTree, prev.source, "reloaded"))
  app.render()

  expect(pickers(opened)).toEqual([null, null])
  expect(await app.frame()).not.toContain(":smiley:")
})
