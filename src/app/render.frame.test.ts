import { test, expect, afterEach } from "bun:test"
import { mountApp } from "../testing/app-render"
import { createCursorState } from "../vim-diff/cursor-state"
import { version } from "../version"

const DIFF = `diff --git a/src/greet.ts b/src/greet.ts
index 1111111..2222222 100644
--- a/src/greet.ts
+++ b/src/greet.ts
@@ -1,3 +1,3 @@
 export function greet() {
-  return "hi"
+  return "hello"
 }
diff --git a/README.md b/README.md
index 3333333..4444444 100644
--- a/README.md
+++ b/README.md
@@ -1,2 +1,3 @@
 # riff
+A diff reviewer.
 
`

let app: Awaited<ReturnType<typeof mountApp>> | null = null
afterEach(async () => {
  await app?.dispose()
  app = null
})

test("a full pass draws the header, the tree beside the diff, and the status bar", async () => {
  app = await mountApp(DIFF, { width: 100, height: 16 })
  // A selection is what gives the status bar text to draw.
  app.setVimState({ ...createCursorState(), line: 2, mode: "visual-line", selectionAnchor: 1 })
  // No refresh time, and the build's version masked: both would change the frame from run to run.
  app.show({ lastRefreshedAt: "" })
  const frame = (await app.frame()).replace(version, "VERSION")
  expect(frame).toBe(
    [
      " riff  All files (2)                                                      0/2 reviewed  VERSION",
      "  Files (0/2)                       ▼   src/greet.ts +1 -1",
      " ○   ▼ src                             1 export function greet() {",
      " ○ M     greet.ts                      2   return \"hi\"",
      " ○ M   README.md                       2   return \"hello\"",
      "                                       3 }",
      "                                         ▸ rest of the file  ↵",
      "",
      "                                    ▼   README.md +1 -0",
      "                                       1 # riff",
      "                                       2 A diff reviewer.",
      "                                       3",
      "                                         ▸ rest of the file  ↵",
      "",
      "",
      " -- VISUAL LINE --  2 lines",
    ].join("\n")
  )
})
