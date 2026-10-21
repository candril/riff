import { expect, test } from "bun:test"
import { DEMO_BLAME, demoBlameSource } from "./demo-source"

test("the demo answers every line, on either side, with its one commit", async () => {
  const source = demoBlameSource()
  expect(await source.lineBlame("any/file.ts", "head", 1)).toEqual(DEMO_BLAME)
  expect(await source.lineBlame("other.md", "base", 999)).toEqual(DEMO_BLAME)
})
