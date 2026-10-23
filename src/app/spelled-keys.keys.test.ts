import { afterEach, expect, test } from "bun:test"
import { KeyEvent, parseKeypress } from "@opentui/core"
import { mountApp } from "../testing/app-render"
import { unguardedKeysOn } from "../testing/chat-keys"
import { spelledStrokes } from "./spelled-keys"
import type { AppKeyContext } from "./key-context"

const DIFF = `diff --git a/src/greet.ts b/src/greet.ts
index 1111111..2222222 100644
--- a/src/greet.ts
+++ b/src/greet.ts
@@ -1,3 +1,3 @@
 export function greet() {
-  return "hi"
+  return "hello"
 }
`

/**
 * `]R` and `[R`, typed the way kitty reports a shifted R, by the name "R"
 * (`\x1b[82;2u`); the mock's parser alone would send the shifted "r" a
 * legacy terminal reports, which the tests below type.
 */
const TYPED_AS_KITTY: Record<string, string> = {
  "bracket.nextThreadAny": "\x1b[82;2u",
  "bracket.prevThreadAny": "\x1b[82;2u",
}

/**
 * The thread panel's hints name the panel they are typed in, after the key:
 * those commands are bound only while the panel holds the keys.
 */
const IN_THREAD_PANEL = / \(comments panel\)$/

let app: Awaited<ReturnType<typeof mountApp>> | null = null
afterEach(async () => {
  await app?.dispose()
  app = null
})

/**
 * riff's own keys on a fresh app, which is where each hint is typed: a
 * command that opens a picker or a panel would otherwise hold the next
 * one's keys. Every command the keymap ran on a key is recorded. Whatever
 * the keys tests' context does not wire throws inside the command, which
 * the keymap still counts as the command having run, so nothing spawns,
 * copies or reaches GitHub.
 */
async function typedOn(command: string) {
  app = await mountApp(DIFF, { width: 100, height: 30 })
  app.show({ showFilePanel: true })
  const { ctx: render } = app
  const keys = unguardedKeysOn(app, {
    getPane: () => null,
    // No file under a highlight past the tree's end: `ge`, `gd` and the
    // rest stop at "No file selected", and `gc` at local mode, before
    // anything is spawned.
    externalToolsContext: {
      getState: () => ({ ...render.getState(), focusedPanel: "tree", treeHighlightIndex: 99 }),
      setState: () => {},
      getVimState: render.getVimState,
      getLineMapping: render.getLineMapping,
      render: () => {},
      toast: { show: () => {}, clear: () => {} },
      suspendRenderer: () => {
        throw new Error("a hint reached an external program")
      },
      resumeRenderer: () => {},
      getHeadSha: () => "",
      options: {},
    } satisfies AppKeyContext["externalToolsContext"],
  })
  if (command.startsWith("threadPanel.")) {
    app.show({
      focusedPanel: "comments",
      inlineCommentOverlay: { ...app.ctx.getState().inlineCommentOverlay, open: true },
    })
  }
  const ran: string[] = []
  keys.keymap.on("dispatch", (event) => {
    if (event.phase === "binding-execute" && typeof event.command === "string") ran.push(event.command)
  })
  keys.keymap.on("error", () => {})
  return { mounted: app, ran }
}

/** The keys a reviewer presses for a hint: the terminal's own bytes, through the mock's real parser. */
async function type(mounted: NonNullable<typeof app>, command: string, keys: string) {
  const { mockInput } = mounted.setup
  const ctrl = /^Ctrl\+([a-z])$/.exec(keys)
  const kitty = TYPED_AS_KITTY[command]
  if (ctrl) mockInput.pressKey(ctrl[1]!, { ctrl: true })
  else if (kitty) {
    await mockInput.typeText(keys.slice(0, -1))
    mounted.setup.renderer.keyInput.emit("keypress", new KeyEvent(parseKeypress(kitty, { useKittyKeyboard: true })!))
  } else await mockInput.typeText(keys)
}

/** Every registered command's hint, read off riff's real layers. */
async function allCommandKeys() {
  const mounted = await mountApp(DIFF, { width: 100, height: 30 })
  const keys = unguardedKeysOn(mounted).commandKeys
  await mounted.dispose()
  return [...keys]
}

const COMMAND_KEYS = await allCommandKeys()

test("every chord family and the global keys spell some of their commands", () => {
  const families = new Set(COMMAND_KEYS.map(([name]) => name.split(".")[0]))
  expect([...families].sort()).toEqual(["bracket", "gchord", "global", "threadPanel", "zchord"])
})

test.each(COMMAND_KEYS)("%s: its hint %p, typed, runs it", async (command, spelled) => {
  const { mounted, ran } = await typedOn(command)
  await type(mounted, command, spelled.replace(IN_THREAD_PANEL, ""))
  expect(ran).toContain(command)
  expect(ran.at(-1)).toBe(command)
  // A command that draws again on the next tick, as Ctrl-b does, draws before the app goes.
  await mounted.frame()
})

test.each(["bracket.nextThreadAny", "bracket.prevThreadAny"])(
  "%s runs on a shifted r as a legacy terminal reports it, by the name \"r\"",
  async (command) => {
    const { mounted, ran } = await typedOn(command)
    await mounted.setup.mockInput.typeText(command === "bracket.nextThreadAny" ? "]R" : "[R")
    expect(ran.at(-1)).toBe(command)
  },
)

test("the strokes the palette runs a command on are the ones a terminal sends for its hint", () => {
  const strokes = (keys: string) =>
    spelledStrokes(keys)?.map(({ name, ctrl, shift, sequence }) => ({ name, ctrl, shift, sequence }))
  expect(strokes("Ctrl+o")).toEqual([{ name: "o", ctrl: true, shift: false, sequence: "\x0f" }])
  // A terminal sends Ctrl-i as tab and Ctrl-h as backspace, which is what their commands read.
  expect(strokes("Ctrl+i")?.[0]?.name).toBe("tab")
  expect(strokes("Ctrl+h")?.[0]?.name).toBe("backspace")
  expect(strokes("zR")).toEqual([
    { name: "z", ctrl: false, shift: false, sequence: "z" },
    { name: "r", ctrl: false, shift: true, sequence: "R" },
  ])
  expect(strokes("*")).toEqual([{ name: "*", ctrl: false, shift: false, sequence: "*" }])
  expect(spelledStrokes("y (comments panel)")).toBeNull()
  expect(spelledStrokes("Esc")).toBeNull()
})
