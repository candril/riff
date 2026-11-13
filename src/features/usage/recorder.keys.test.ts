import { afterEach, expect, test } from "bun:test"
import { KeyEvent, parseKeypress } from "@opentui/core"
import { mountApp } from "../../testing/app-render"
import { keysOn } from "../../testing/chat-keys"
import { createUsageRecorder, recordKeymapUsage } from "./recorder"
import { createActionMenuState } from "../action-menu/state"
import type { UsageCounts } from "./counts"
import { KEY_ATTRIBUTION } from "./report"

const fileDiff = (name: string) => `diff --git a/${name} b/${name}
index 1111111..2222222 100644
--- a/${name}
+++ b/${name}
@@ -1,3 +1,3 @@
 a
-b
+c
 d
`

let app: Awaited<ReturnType<typeof mountApp>> | null = null
afterEach(async () => {
  await app?.dispose()
  app = null
})

function memoryStore(initial: UsageCounts | null = null) {
  let saved = initial
  const saves: UsageCounts[] = []
  return {
    saves,
    store: {
      load: () => saved,
      save: (counts: UsageCounts) => {
        saved = counts
        saves.push(counts)
      },
      now: () => new Date("2026-11-13T12:00:00Z"),
    },
  }
}

async function recording(more: Parameters<typeof keysOn>[1] = {}) {
  app = await mountApp(fileDiff("a.ts") + fileDiff("b.ts"), { width: 120, height: 30 })
  app.show({ focusedPanel: "diff" })
  const keys = keysOn(app, more)
  const memory = memoryStore()
  const recorder = createUsageRecorder(memory.store)
  recordKeymapUsage(keys.keymap, recorder)
  return { mounted: app, keys, recorder, ...memory }
}

test("a chord's command is counted once, under its name, and the diff's keys under the key", async () => {
  const { mounted, recorder, saves } = await recording()

  for (const key of ["]", "f", "V", "j", "V"]) mounted.setup.mockInput.pressKey(key)
  recorder.flush()

  expect(saves[0]!.keys["bracket.nextFile"]).toBe(1)
  expect(saves[0]!.keys["diff.key V"]).toBe(2)
  expect(Object.keys(saves[0]!.keys).some((name) => name.startsWith("bracket.") && name !== "bracket.nextFile")).toBe(false)
})

test("the tree's keys are counted per key as the diff's are", async () => {
  const { mounted, recorder, saves } = await recording({ toggleUnviewedFilesOnly: () => {} })

  mounted.show({ focusedPanel: "tree" })
  mounted.setup.mockInput.pressKey("H")
  recorder.flush()

  expect(saves[0]!.keys).toEqual({ "tree.key H": 1 })
})

test("every command the report reads an action's key count off is one the keymap has", async () => {
  const { keys } = await recording()
  const registered = new Set(keys.keymap.getCommands({ visibility: "registered" }).map((command) => command.name))

  expect(Object.values(KEY_ATTRIBUTION).map((entry) => entry.command).filter((name) => !registered.has(name))).toEqual([])
})

test("a command the palette runs is not counted as its key", async () => {
  const { keys, recorder, saves } = await recording()
  const f = new KeyEvent(parseKeypress("f", { useKittyKeyboard: true })!)

  expect(keys.keymap.runCommand("bracket.nextFile", { event: f }).ok).toBe(true)
  recorder.flush()

  expect(saves).toEqual([])
})

test("a flush adds to what the file already holds and keeps when counting began", () => {
  const memory = memoryStore({ since: "2026-11-01T00:00:00.000Z", keys: { "gchord.refresh": 3 }, palette: { quit: 1 } })
  const recorder = createUsageRecorder(memory.store)

  recorder.command("gchord.refresh")
  recorder.pick("quit")
  recorder.pick("find-files")
  recorder.flush()
  recorder.flush()

  expect(memory.saves).toEqual([
    { since: "2026-11-01T00:00:00.000Z", keys: { "gchord.refresh": 4 }, palette: { quit: 2, "find-files": 1 } },
  ])
})

test("a save that throws loses that flush, not the review", () => {
  const recorder = createUsageRecorder({ load: () => null, save: () => { throw new Error("read-only") } })
  recorder.command("gchord.refresh")

  expect(() => recorder.flush()).not.toThrow()
})

test("the palette's pick reaches every listener until it unsubscribes", () => {
  const menu = createActionMenuState()
  const picks: string[] = []
  const stop = menu.onPick((id) => void picks.push(id))

  menu.picked("quit")
  stop()
  menu.picked("refresh")

  expect(picks).toEqual(["quit"])
})
