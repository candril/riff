import { afterEach, expect, mock, test } from "bun:test"
import { composing, overlay, send } from "../testing/composer-keys"

let dispose: (() => Promise<void>) | null = null
afterEach(async () => {
  mock.restore()
  await dispose?.()
  dispose = null
})

async function composer(...args: Parameters<typeof composing>) {
  const opened = await composing(...args)
  dispose = opened.app.dispose
  return opened
}

test("q, j, i, g and ? type into the composer, and nothing else happens", async () => {
  const { app, keys, textarea } = await composer()
  const before = keys.vimState()
  await app.setup.mockInput.typeText("qjig?")

  expect(textarea.plainText).toBe("qjig?")
  expect(overlay(app).mode).toBe("compose")
  expect(keys.quits).toEqual([])
  expect(keys.vimState()).toBe(before)
  expect(keys.chordPending()).toBe(false)
  expect(app.help.open()).toBe(false)
})

test("Esc closes the composer and keeps the draft on its line", async () => {
  const { app, settled } = await composer()
  await app.setup.mockInput.typeText("almost")
  send(app, "\x1b")

  expect(overlay(app).mode).toBe("view")
  expect(settled).toEqual(["dropped"])
  expect([...app.commentDrafts.drafts().values()]).toEqual(["almost"])
  expect(app.toast.current()?.message).toBe("Draft kept for this line")
})

test("Esc on an empty composer keeps no draft and says nothing", async () => {
  const { app, settled } = await composer()
  send(app, "\x1b")

  expect(overlay(app).mode).toBe("view")
  expect(settled).toEqual(["dropped"])
  expect(app.toast.current()).toBeNull()
})

test("Esc with a modifier held still closes the composer", async () => {
  const { app, settled } = await composer()
  send(app, "\x1b[27;3u")

  expect(overlay(app).mode).toBe("view")
  expect(settled).toEqual(["dropped"])
})

for (const [label, press] of [
  ["Enter", "\r"],
  ["Shift-Enter", "\x1b[13;2u"],
  ["Alt-Enter", "\x1b[13;3u"],
  ["Ctrl-Enter", "\x1b[13;5u"],
  ["Ctrl-s", "\x13"],
] as const) {
  test(`${label} saves the comment in local mode`, async () => {
    const { app, settled, submitted } = await composer()
    await app.setup.mockInput.typeText("looks good")
    const key = send(app, press)

    expect(key.defaultPrevented).toBe(true)
    expect(overlay(app).mode).toBe("view")
    expect(app.ctx.getState().comments.map((c) => c.body)).toEqual(["looks good"])
    expect(settled).toEqual(["saved"])
    await Bun.sleep(0)
    expect(submitted).not.toHaveBeenCalled()
  })
}

for (const [label, press] of [
  ["Ctrl-p", "\x10"],
  ["Ctrl-Enter", "\x1b[13;5u"],
] as const) {
  test(`${label} saves the comment in a PR and posts it`, async () => {
    const { app, settled, submitted } = await composer({ appMode: "pr" })
    await app.setup.mockInput.typeText("looks good")
    send(app, press)

    const saved = app.ctx.getState().comments
    expect(saved.map((c) => c.body)).toEqual(["looks good"])
    expect(settled).toEqual(["published"])
    await Bun.sleep(0)
    expect(submitted).toHaveBeenCalledTimes(1)
    expect(submitted.mock.calls[0]![1]).toBe(saved[0])
  })
}

test("Ctrl-p in local mode leaves the composer open and the key unprevented", async () => {
  const { app, settled } = await composer()
  await app.setup.mockInput.typeText("draft")
  const key = send(app, "\x10")

  expect(key.defaultPrevented).toBe(false)
  expect(overlay(app).mode).toBe("compose")
  expect(app.ctx.getState().comments).toEqual([])
  expect(settled).toEqual([])
})

test("a key named enter is not a save key: the textarea gets it", async () => {
  const { app, settled } = await composer()
  await app.setup.mockInput.typeText("draft")
  const key = send(app, "\r", "enter")

  expect(key.defaultPrevented).toBe(false)
  expect(overlay(app).mode).toBe("compose")
  expect(app.ctx.getState().comments).toEqual([])
  expect(settled).toEqual([])
})

test("Ctrl-o puts a suggestion block with the commented line at the cursor", async () => {
  const { app, textarea } = await composer()
  send(app, "\x0f")

  const block = '```suggestion\n  return "hello"\n```\n'
  expect(textarea.plainText).toBe(block)
  expect(overlay(app).input).toBe(block)
  expect(overlay(app).mode).toBe("compose")
})

test("Ctrl-o after text on the line starts the block on the next one", async () => {
  const { app, textarea } = await composer()
  await app.setup.mockInput.typeText("Simpler:")
  send(app, "\x0f")

  expect(textarea.plainText).toBe('Simpler:\n```suggestion\n  return "hello"\n```\n')
})

test("Ctrl-o at the start of a line adds no blank line", async () => {
  const { app, textarea } = await composer()
  await app.setup.mockInput.typeText("Simpler:")
  send(app, "\n")
  send(app, "\x0f")

  expect(textarea.plainText).toBe('Simpler:\n```suggestion\n  return "hello"\n```\n')
})

test("Ctrl-y with no picker up inserts no suggestion", async () => {
  const { app, textarea } = await composer()
  send(app, "\x19")

  expect(textarea.plainText).toBe("")
})

test("Ctrl-o says so when riff cannot read the commented lines", async () => {
  const { app, textarea } = await composer()
  app.ctx.setState((s) => ({ ...s, inlineCommentOverlay: { ...s.inlineCommentOverlay, line: 99 } }))
  send(app, "\x0f")

  expect(textarea.plainText).toBe("")
  expect(app.toast.current()?.message).toBe("Nothing to suggest — riff cannot read those lines")
})

test("Ctrl-g hands the live draft to $EDITOR and takes back what it returns", async () => {
  const { app, textarea, editor, suspended } = await composer()
  await app.setup.mockInput.typeText("rough")
  // Shift held as well: the chain matched Ctrl-g by its name alone.
  const key = send(app, "\x1b[103;6u")
  expect(key.defaultPrevented).toBe(true)
  await Bun.sleep(0)

  expect(editor).toHaveBeenCalledTimes(1)
  expect(editor.mock.calls[0]![0]).toBe("rough")
  expect(suspended).toEqual(["suspend", "resume"])
  expect(textarea.plainText).toBe("from the editor")
  expect(overlay(app).input).toBe("from the editor")
})

test("with the confirm dialog up over the composer, Esc answers the dialog", async () => {
  const { app, settled } = await composer()
  const answers: string[] = []
  app.confirm.show({
    title: "Delete comment?",
    message: "Gone.",
    onConfirm: () => void answers.push("yes"),
    onCancel: () => {
      answers.push("no")
      app.confirm.close()
    },
  })
  send(app, "\x1b")

  expect(answers).toEqual(["no"])
  expect(overlay(app).mode).toBe("compose")
  expect(settled).toEqual([])
})
