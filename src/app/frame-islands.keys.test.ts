import { test, expect, afterEach } from "bun:test"
import { mountApp } from "../testing/app-render"
import { keysOn } from "../testing/chat-keys"

const DIFF = `diff --git a/src/greet.ts b/src/greet.ts
index 1111111..2222222 100644
--- a/src/greet.ts
+++ b/src/greet.ts
@@ -1,1 +1,1 @@
-  return "hi"
+  return "hello"
diff --git a/src/farewell.ts b/src/farewell.ts
index 3333333..4444444 100644
--- a/src/farewell.ts
+++ b/src/farewell.ts
@@ -1,1 +1,1 @@
-  return "bye"
+  return "goodbye"
`

let app: Awaited<ReturnType<typeof mountApp>> | null = null
afterEach(async () => {
  await app?.dispose()
  app = null
})

/** The picker's box: every row from its title down, from the title's column on. */
function pickerBox(frame: string): string {
  const lines = frame.split("\n")
  const title = lines.findIndex((line) => line.includes("Find Files"))
  const column = lines[title]!.indexOf("Find Files")
  return lines
    .slice(title)
    .map((line) => line.slice(column))
    .join("\n")
}

// The picker draws its rows from the frame, published after routePrompt has
// handed the field its text: the row filtered by what was typed is drawn in
// the same pass as the text that filtered it.
test("Ctrl-f opens the file picker and what is typed into its field narrows the rows it draws", async () => {
  app = await mountApp(DIFF, { width: 100, height: 30 })
  app.show()
  keysOn(app)
  const { mockInput } = app.setup

  mockInput.pressKey("f", { ctrl: true })
  expect(app.islands.filePicker.host.visible).toBe(true)
  let rows = pickerBox(await app.frame())
  expect(rows).toContain("src/greet.ts")
  expect(rows).toContain("src/farewell.ts")

  await mockInput.typeText("fare")
  expect(app.ctx.getState().filePicker.query).toBe("fare")
  expect(app.islands.filePicker.field().value).toBe("fare")
  rows = pickerBox(await app.frame())
  expect(rows).toMatch(/Find Files\s+1\/1/)
  expect(rows.split("\n").map((line) => line.trim())).toContain("fare")
  expect(rows).toContain("src/farewell.ts")
  expect(rows).not.toContain("src/greet.ts")
})
