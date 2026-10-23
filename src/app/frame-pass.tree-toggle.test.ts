import { test, expect, afterEach } from "bun:test"
import { mountApp } from "../testing/app-render"
import { trimFrame } from "../testing/frame"

const added = (n: number) =>
  `+  const line${n} = [first, second, third, fourth, fifth, sixth, seventh, eighth, ninth, tenth].join(" ") // END${n}`

const DIFF = `diff --git a/src/greet.ts b/src/greet.ts
index 1111111..2222222 100644
--- a/src/greet.ts
+++ b/src/greet.ts
@@ -1,1 +1,40 @@
 export function greet() {
${Array.from({ length: 40 }, (_, i) => added(i)).join("\n")}
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

/**
 * The frame Ctrl-b's own render pass draws, with no tick for a deferred
 * size to land in: what the reader sees until anything else redraws.
 */
async function firstFrameAfter(patch: Parameters<NonNullable<typeof app>["show"]>[0]) {
  app!.show(patch)
  await app!.setup.renderOnce()
  return app!.setup.captureCharFrame().split("\n")
}

test("hiding the tree widens the unified diff to the whole screen in the frame Ctrl-b draws", async () => {
  app = await mountApp(DIFF, { width: 120, height: 30 })
  app.show({ showFilePanel: true })
  await app.frame()

  const rows = await firstFrameAfter({ showFilePanel: false })
  const greet = rows.find((row) => row.includes("1 export function greet"))!
  expect(greet.startsWith("    1 export function greet")).toBe(true)
  for (const row of rows.slice(1, 14)) expect(row[119]).toBe("█")
  expect(rows.some((row) => row.includes("// END0"))).toBe(true)
  expect(trimFrame(rows.join("\n"))).toBe(await app.frame())
})

test("showing the tree narrows the unified diff beside it in the frame Ctrl-b draws", async () => {
  app = await mountApp(DIFF, { width: 120, height: 30 })
  app.show({ showFilePanel: false })
  await app.frame()

  const rows = await firstFrameAfter({ showFilePanel: true })
  expect(rows[1]).toContain("Files (0/2)")
  const greet = rows.find((row) => row.includes("1 export function greet"))!
  expect(greet.indexOf("1 export function greet")).toBe(35 + 4)
  for (const row of rows.slice(1, 14)) expect(row[119]).toBe("█")
  expect(rows.some((row) => row.includes("// END0"))).toBe(false)
  expect(trimFrame(rows.join("\n"))).toBe(await app.frame())
})

test("split redraws both panes at the new width in the frame Ctrl-b draws", async () => {
  app = await mountApp(DIFF, { width: 160, height: 12 })
  app.diffOptions.toggleSplit()
  app.show({ showFilePanel: true })
  await app.frame()

  const hidden = await firstFrameAfter({ showFilePanel: false })
  expect(trimFrame(hidden.join("\n"))).toBe(await app.frame())
  expect(hidden.find((row) => row.includes("1 export function greet"))!.startsWith("    1 export")).toBe(true)

  const shown = await firstFrameAfter({ showFilePanel: true })
  expect(trimFrame(shown.join("\n"))).toBe(await app.frame())
  expect(shown[1]).toContain("Files (0/2)")
})
