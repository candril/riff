import { afterEach, describe, expect, test } from "bun:test"
import { jumpScenario, KEY, SCENARIO_DIFF, type JumpScenario } from "../testing/jump-scenarios"
import { stubPanel } from "../testing/pr-info-panel-keys"

/*
 * A jump lands the cursor's line at the middle of the diff or above it
 * (spec 089, "Where a jump lands"): each jump kind through riff's real
 * keys, with the target off-screen or in the lower half before it.
 */

let app: JumpScenario | null = null
afterEach(async () => {
  await app?.dispose()
  app = null
})

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

async function scenario(options?: Parameters<typeof jumpScenario>[0]) {
  app = await jumpScenario(options)
  await flush()
  return app
}

const type = (a: JumpScenario, text: string) => a.press(...text.split(""))

/** `act` takes the cursor to a row the window did not show in its upper half, and the window brings it there. */
async function landsInUpperHalf(a: JumpScenario, act: () => void) {
  // A pane takes its laid-out size a frame later, which in riff falls between two keys.
  await a.mounted.frame()
  const before = a.window()
  act()
  await flush()
  const after = a.window()
  const half = Math.floor(after.height / 2)
  expect(after.row < before.scrollTop || after.row > before.scrollTop + Math.floor(before.height / 2)).toBe(true)
  expect(a.screenRow()).toBeGreaterThanOrEqual(0)
  expect(a.screenRow()).toBeLessThanOrEqual(half)
}

/** `act` leaves the window where it was. */
async function keepsTheWindow(a: JumpScenario, act: () => void) {
  await a.mounted.frame()
  const before = a.window().scrollTop
  act()
  await flush()
  expect(a.window().scrollTop).toBe(before)
}

async function searchFor(a: JumpScenario, pattern: string) {
  a.press("/")
  type(a, pattern)
  a.press(KEY.enter)
  await flush()
}

describe("a jump lands in the upper half of the diff", () => {
  test("/ search and Enter", async () => {
    const a = await scenario()
    await landsInUpperHalf(a, () => {
      a.press("/")
      type(a, "needle 45")
      a.press(KEY.enter)
    })
    expect(a.where().text).toContain("alpha.ts needle 45")
  })

  test("n", async () => {
    const a = await scenario()
    await searchFor(a, "needle")
    expect(a.where().text).toContain("alpha.ts needle 5")
    await landsInUpperHalf(a, () => a.press("n"))
    expect(a.where().text).toContain("alpha.ts needle 25")
  })

  test("N to a match above the window", async () => {
    const a = await scenario()
    await searchFor(a, "needle")
    a.moveTo(a.lineOf("src/beta.ts", "line 3"))
    a.press("z", "t")
    await flush()
    await landsInUpperHalf(a, () => a.press(KEY.N))
    expect(a.where().text).toContain("alpha.ts needle 65")
  })

  test("*", async () => {
    const a = await scenario()
    const line = a.lineOf("src/alpha.ts", "needle 5")
    a.moveTo(line, a.mounted.ctx.getLineMapping().getLine(line)!.content.indexOf("needle"))
    await landsInUpperHalf(a, () => a.press("*"))
    expect(a.where().text).toContain("alpha.ts needle 25")
  })

  test("]c", async () => {
    const a = await scenario()
    a.moveTo(a.lineOf("src/alpha.ts", "line 24"))
    await flush()
    await landsInUpperHalf(a, () => a.press("]", "c"))
  })

  test("]f in the all-files view", async () => {
    const a = await scenario()
    a.moveTo(a.lineOf("src/alpha.ts", "line 3"))
    await landsInUpperHalf(a, () => a.press("]", "f"))
    expect(a.where().file).toBe("src/beta.ts")
  })

  test("Enter on a file in the tree, in the all-files view", async () => {
    const a = await scenario()
    a.mounted.show({ focusedPanel: "tree" })
    a.press("j", "j", "j")
    await landsInUpperHalf(a, () => a.press(KEY.enter))
    expect(a.where().file).toBe("src/gamma.ts")
    expect(a.where().view.singleFile).toBe(false)
  })

  test("'a", async () => {
    const a = await scenario()
    a.moveTo(a.lineOf("src/gamma.ts", "line 43"))
    a.press("m", "a")
    a.moveTo(a.lineOf("src/alpha.ts", "line 3"))
    await flush()
    await landsInUpperHalf(a, () => a.press("'", "a"))
    expect(a.where().text).toContain("gamma.ts line 43")
  })

  test("flash onto a line in the lower half", async () => {
    const a = await scenario()
    a.moveTo(a.lineOf("src/alpha.ts", "line 2"))
    await flush()
    const target = a.lineOf("src/alpha.ts", "line 27")
    await landsInUpperHalf(a, () => {
      a.press("s")
      type(a, "line 27")
      const label = a.flashLabel(target)
      expect(label).not.toBeNull()
      a.press(label!)
    })
    expect(a.where().line).toBe(target)
  })

  test("Ctrl-o back to a place far below", async () => {
    const a = await scenario()
    a.moveTo(a.lineOf("src/beta.ts", "line 43"))
    a.press("g", "g")
    await flush()
    await landsInUpperHalf(a, () => a.press(KEY.ctrlO))
    expect(a.where().text).toContain("beta.ts line 43")
  })

  test("the thread panel's j to a thread further down", async () => {
    const a = await scenario()
    a.moveTo(a.lineOf("src/alpha.ts", "needle 5"))
    a.press(KEY.ctrlT)
    await flush()
    expect(a.state().inlineCommentOverlay.open).toBe(true)
    await landsInUpperHalf(a, () => a.press("j"))
    expect(a.where().text).toContain("alpha.ts needle 45")
  })

  test("a file opened from the PR overview", async () => {
    const { controller } = stubPanel([], { section: "files" })
    const panel = { ...controller, getSelectedFile: () => ({ filename: "src/gamma.ts" }) } as typeof controller
    const a = await scenario({ more: { getPrInfoPanel: () => panel } })
    a.moveTo(a.lineOf("src/alpha.ts", "line 24"))
    a.mounted.show({ viewMode: "state", appMode: "pr" })
    a.press("d")
    await flush()
    expect(a.state().viewMode).toBe("diff")
    expect(a.where().file).toBe("src/gamma.ts")
    expect(a.screenRow()).toBeGreaterThanOrEqual(0)
    expect(a.screenRow()).toBeLessThanOrEqual(Math.floor(a.window().height / 2))
  })
})

describe("in split", () => {
  test("n", async () => {
    const a = await scenario()
    a.press("\\")
    expect(a.mounted.diffOptions.splitView()).toBe(true)
    await searchFor(a, "needle")
    await landsInUpperHalf(a, () => a.press("n"))
    expect(a.where().text).toContain("alpha.ts needle 25")
  })

  test("]c", async () => {
    const a = await scenario()
    a.press("\\")
    a.moveTo(a.lineOf("src/alpha.ts", "line 24"))
    await flush()
    expect(a.mounted.diffOptions.splitView()).toBe(true)
    await landsInUpperHalf(a, () => a.press("]", "c"))
  })
})

describe("with wrap on, counting the rows a long line wraps to", () => {
  const long = (n: number) => `   const w${n} = "${"wrapped ".repeat(40)}${n}"`
  const wrapping = [
    "diff --git a/src/long.ts b/src/long.ts",
    "index 1111111..2222222 100644",
    "--- a/src/long.ts",
    "+++ b/src/long.ts",
    "@@ -1,30 +1,30 @@",
    ...Array.from({ length: 29 }, (_, i) => long(i + 1)),
    "-  const target = 1",
    "+  const target = 2",
    "",
  ].join("\n")

  test("n", async () => {
    const a = await scenario({ diff: wrapping + SCENARIO_DIFF })
    a.press("z", "w")
    await flush()
    await landsInUpperHalf(a, () => {
      a.press("/")
      type(a, "target = 2")
      a.press(KEY.enter)
    })
    // Each long line takes more than one row, so the match lies further down than its line count says.
    expect(a.window().row).toBeGreaterThan(a.where().line + 10)
    a.press("g", "g")
    await flush()
    await landsInUpperHalf(a, () => a.press("n"))
    expect(a.where().text).toContain("target = 2")
  })
})

describe("what keeps the window it has", () => {
  test("j into the lower half", async () => {
    const a = await scenario()
    a.moveTo(a.lineOf("src/alpha.ts", "line 23"))
    await flush()
    expect(a.window().scrollTop).toBe(0)
    await keepsTheWindow(a, () => a.press("j"))
    expect(a.screenRow()).toBeGreaterThan(Math.floor(a.window().height / 2))
  })

  test("Ctrl-d", async () => {
    const a = await scenario()
    a.moveTo(a.lineOf("src/alpha.ts", "line 8"))
    await flush()
    await keepsTheWindow(a, () => a.press(KEY.ctrlD))
    expect(a.screenRow()).toBeGreaterThan(Math.floor(a.window().height / 2))
  })

  test("L", async () => {
    const a = await scenario()
    a.moveTo(a.lineOf("src/alpha.ts", "line 22"))
    await flush()
    await keepsTheWindow(a, () => a.press(KEY.L))
  })

  test("n to a match already in the upper half", async () => {
    const a = await scenario()
    await searchFor(a, "needle")
    a.moveTo(a.lineOf("src/alpha.ts", "line 1"))
    await flush()
    await keepsTheWindow(a, () => a.press("n"))
    expect(a.where().text).toContain("alpha.ts needle 5")
  })
})
