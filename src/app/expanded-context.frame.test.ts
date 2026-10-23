import { test, expect, afterEach, describe } from "bun:test"
import { mountApp } from "../testing/app-render"

const DIFF = `diff --git a/src/greet.ts b/src/greet.ts
index 1111111..2222222 100644
--- a/src/greet.ts
+++ b/src/greet.ts
@@ -4,3 +4,3 @@
 export function greet() {
-  return "hi"
+  return "hello"
 }
`

const FILE = ["// HIDDEN ONE", "// HIDDEN TWO", "// HIDDEN THREE", "export function greet() {", '  return "hello"', "}"].join("\n")
const DIVIDER = "src/greet.ts:start:0"

let app: Awaited<ReturnType<typeof mountApp>> | null = null
afterEach(async () => {
  await app?.dispose()
  app = null
})

for (const split of [false, true]) {
  describe(split ? "split" : "unified", () => {
    async function mounted() {
      app = await mountApp(DIFF, { width: 160, height: 16 })
      if (split) app.diffOptions.toggleSplit()
      app.show({ showFilePanel: false })
      const changed = (await app.frame()).split("\n").find((row) => row.includes(`return "hi"`))!
      // Side by side, the removal and its replacement share a row.
      expect(changed.includes(`return "hello"`)).toBe(split)
      return app
    }

    test("the divider being fetched reads as expanding, off the factory", async () => {
      const app = await mounted()
      expect(await app.frame()).toContain("3 lines")
      expect(await app.frame()).not.toContain("Expanding")

      app.fileContent.setExpanding(DIVIDER)
      app.render()

      expect(await app.frame()).toContain("⟳ Expanding 3 lines…")
    })

    test("an expanded divider draws the hidden context once the mapping is rebuilt", async () => {
      const app = await mounted()
      expect(await app.frame()).not.toContain("HIDDEN")

      app.fileContent.set("src/greet.ts", FILE, FILE)
      app.fileContent.expand(DIVIDER)
      app.show({ files: app.ctx.getState().files })

      const frame = await app.frame()
      for (const line of ["// HIDDEN ONE", "// HIDDEN TWO", "// HIDDEN THREE"]) expect(frame).toContain(line)
      expect(frame).not.toContain("3 lines")
    })
  })
}
