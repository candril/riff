import { afterEach, expect, mock, test } from "bun:test"
import { KeyEvent, parseKeypress } from "@opentui/core"
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

test("cancelling the composer clears a picker left standing, so the composer reopened on the line draws none", async () => {
  const opened = await composer()
  await typingSmil(opened)

  send(opened.app, "\x1b")
  expect(overlay(opened.app).mode).toBe("compose")
  expect(pickers(opened)).toEqual([null, null])
  // Esc reaches the composer's cancel only once the picker layer has let it
  // go, so no key cancels with a picker up. Run on a standing picker, the
  // cancel command shows its own clear, which the close above could hide.
  opened.app.composerPickers.setEmoji({ query: "smil", colonOffset: 3 })
  const escape = new KeyEvent(parseKeypress("\x1b")!)
  expect(opened.keys.keymap.runCommand("composer.cancel", { event: escape }).ok).toBe(true)
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

// Every way into the composer or onto another thread starts with no picker.
// No key leaves one standing outside the composer, since leaving it clears
// them, so each case sets one on the factory just before its key.
const standingPicker = (opened: Opened) => opened.app.composerPickers.setEmoji({ query: "smil", colonOffset: 3 })

/** A saved comment on the changed line, the panel on it in view mode. */
async function savedComment() {
  const opened = await composer()
  await opened.app.setup.mockInput.typeText("hi")
  send(opened.app, "\r")
  expect(overlay(opened.app).mode).toBe("view")
  expect(opened.app.ctx.getState().comments).toHaveLength(1)
  return opened
}

test("c on a diff line opens the composer with no picker", async () => {
  const opened = await savedComment()
  ctrl(opened.app, "h")
  standingPicker(opened)
  opened.app.setup.mockInput.pressKey("c")
  expect(overlay(opened.app).mode).toBe("compose")
  expect(pickers(opened)).toEqual([null, null])
})

test("n in the panel starts a new comment with no picker", async () => {
  const opened = await savedComment()
  standingPicker(opened)
  opened.app.setup.mockInput.pressKey("n")
  expect(overlay(opened.app).mode).toBe("compose")
  expect(pickers(opened)).toEqual([null, null])
})

test("r in the panel starts a reply with no picker", async () => {
  const opened = await savedComment()
  standingPicker(opened)
  opened.app.setup.mockInput.pressKey("r")
  expect(overlay(opened.app).mode).toBe("compose")
  expect(pickers(opened)).toEqual([null, null])
})

test("e in the panel edits the comment with no picker", async () => {
  const opened = await savedComment()
  standingPicker(opened)
  opened.app.setup.mockInput.pressKey("e")
  expect(overlay(opened.app).mode).toBe("edit")
  expect(pickers(opened)).toEqual([null, null])
})
