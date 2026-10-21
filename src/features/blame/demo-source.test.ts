import { expect, test } from "bun:test"
import { DEMO_BLAME, DEMO_LATER_BLAME, demoBlameSource } from "./demo-source"

test("the demo blames a file's first three lines on one commit and the rest on another, on either side", async () => {
  const source = demoBlameSource()
  expect(await source.lineBlame("any/file.ts", "head", 1)).toEqual(DEMO_BLAME)
  expect(await source.lineBlame("any/file.ts", "base", 3)).toEqual(DEMO_BLAME)
  expect(await source.lineBlame("other.md", "base", 4)).toEqual(DEMO_LATER_BLAME)
  expect(await source.lineBlame("other.md", "head", 999)).toEqual(DEMO_LATER_BLAME)
})

test("the whole file's blame agrees with each line's, and names the first commit's PR", async () => {
  const loaded = (await demoBlameSource().fileBlame("any/file.ts", "head"))!
  expect(loaded.blame[0]).toBeUndefined()
  for (const line of [1, 3, 4, 200]) {
    expect(loaded.blame[line]).toEqual((await demoBlameSource().lineBlame("any/file.ts", "head", line))!.line)
  }
  expect([...loaded.prs!.values()]).toEqual([DEMO_BLAME.pr!])
})
