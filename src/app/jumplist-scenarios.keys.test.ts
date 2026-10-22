import { afterEach, describe, expect, test } from "bun:test"
import {
  jumpScenario,
  KEY,
  SCENARIO_DIFF,
  SCENARIO_FILES,
  scenarioDiff,
  type JumpScenario,
  type Place,
} from "../testing/jump-scenarios"
import { stubPanel } from "../testing/pr-info-panel-keys"
import { parseDiff } from "../utils/diff-parser"
import { buildFileTree } from "../utils/file-tree"

/*
 * nvim's jumplist rules (default jumpoptions), each driven through riff's
 * real keys with the place asserted after every Ctrl-o and Ctrl-i. The
 * rules come from the user's report that the list still goes wrong; a
 * scenario riff does not meet yet is a test.todo with its body intact.
 */

let app: JumpScenario | null = null
afterEach(async () => {
  await app?.dispose()
  app = null
})

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

async function scenario(options?: Parameters<typeof jumpScenario>[0]) {
  app = await jumpScenario(options)
  return app
}

/** The place without the focus, which rule g asserts on its own. */
const spot = ({ focus: _focus, ...rest }: Place) => rest

/** `act` jumps; Ctrl-o comes back to where it started, and Ctrl-i goes there again. */
async function recordsAndReturns(a: JumpScenario, act: () => void | Promise<void>) {
  const before = a.where()
  await act()
  await flush()
  const after = a.where()
  expect(spot(after)).not.toEqual(spot(before))
  a.press(KEY.ctrlO)
  await flush()
  expect(spot(a.where())).toEqual(spot(before))
  a.press(KEY.tab)
  await flush()
  expect(spot(a.where())).toEqual(spot(after))
}

const type = (a: JumpScenario, text: string) => a.press(...text.split(""))

describe("a: a jump records the place before it, and Ctrl-o returns there", () => {
  test("gg", async () => {
    const a = await scenario()
    a.moveTo(a.lineOf("src/alpha.ts", "line 24"))
    await recordsAndReturns(a, () => a.press("g", "g"))
  })

  test("G", async () => {
    const a = await scenario()
    a.moveTo(a.lineOf("src/alpha.ts", "line 24"))
    await recordsAndReturns(a, () => a.press(KEY.G))
  })

  test("/ search and Enter", async () => {
    const a = await scenario()
    a.moveTo(a.lineOf("src/alpha.ts", "line 22"))
    await recordsAndReturns(a, () => {
      a.press("/")
      type(a, "needle")
      a.press(KEY.enter)
    })
  })

  test("? search and Enter", async () => {
    const a = await scenario()
    a.moveTo(a.lineOf("src/alpha.ts", "line 28"))
    await recordsAndReturns(a, () => {
      a.press("?")
      type(a, "needle")
      a.press(KEY.enter)
    })
  })

  test("n and N", async () => {
    const a = await scenario()
    a.press("/")
    type(a, "needle")
    a.press(KEY.enter)
    a.moveTo(a.lineOf("src/beta.ts", "line 22"))
    await recordsAndReturns(a, () => a.press("n"))
    a.moveTo(a.lineOf("src/beta.ts", "line 28"))
    await recordsAndReturns(a, () => a.press(KEY.N))
  })

  test("* and #", async () => {
    const a = await scenario()
    const onNeedle = (file: string, n: number) => {
      const line = a.lineOf(file, `needle ${n}`)
      a.moveTo(line, a.where().text === null ? 0 : a.mounted.ctx.getLineMapping().getLine(line)!.content.indexOf("needle"))
    }
    onNeedle("src/beta.ts", 25)
    await recordsAndReturns(a, () => a.press("*"))
    onNeedle("src/beta.ts", 25)
    await recordsAndReturns(a, () => a.press("#"))
  })

  test("'a, and '' back to the mark before", async () => {
    const a = await scenario()
    a.moveTo(a.lineOf("src/gamma.ts", "line 43"))
    a.press("m", "a")
    a.moveTo(a.lineOf("src/beta.ts", "line 3"))
    a.press("m", "b")
    a.moveTo(a.lineOf("src/alpha.ts", "line 3"))
    await recordsAndReturns(a, () => a.press("'", "a"))
    a.press("'", "b")
    // riff's '' flips to the mark visited before (spec 101), where nvim's goes to the place before the last jump.
    await recordsAndReturns(a, () => a.press("'", "'"))
    expect(a.where().text).toContain("gamma.ts line 43")
  })

  test("]c and [c", async () => {
    const a = await scenario()
    a.moveTo(a.lineOf("src/alpha.ts", "line 3"))
    await recordsAndReturns(a, () => a.press("]", "c"))
    a.moveTo(a.lineOf("src/alpha.ts", "line 43"))
    await recordsAndReturns(a, () => a.press("[", "c"))
  })

  test("]f and [f", async () => {
    const a = await scenario()
    a.moveTo(a.lineOf("src/alpha.ts", "line 3"))
    await recordsAndReturns(a, () => a.press("]", "f"))
    a.moveTo(a.lineOf("src/gamma.ts", "line 3"))
    await recordsAndReturns(a, () => a.press("[", "f"))
  })

  test("flash", async () => {
    const a = await scenario()
    a.moveTo(a.lineOf("src/alpha.ts", "line 2"))
    const target = a.lineOf("src/alpha.ts", "needle 25")
    await recordsAndReturns(a, () => {
      a.press("s")
      type(a, "needle 25")
      const label = a.flashLabel(target)
      expect(label).not.toBeNull()
      a.press(label!)
    })
  })

  test("the file picker", async () => {
    const a = await scenario()
    a.moveTo(a.lineOf("src/alpha.ts", "line 24"))
    await recordsAndReturns(a, () => a.press(KEY.ctrlF, KEY.ctrlN, KEY.enter))
  })

  // The jump opens the thread panel on the comment and focuses it, and the panel holds Ctrl-o.
  test.todo("the comments picker", async () => {
    const a = await scenario()
    a.moveTo(a.lineOf("src/beta.ts", "line 24"))
    await recordsAndReturns(a, () => a.press("g", KEY.C, KEY.enter))
  })

  test("the marks picker", async () => {
    const a = await scenario()
    a.moveTo(a.lineOf("src/gamma.ts", "line 43"))
    a.press("m", "a")
    a.moveTo(a.lineOf("src/alpha.ts", "line 3"))
    await recordsAndReturns(a, () => a.press(KEY.ctrlK, KEY.enter))
  })

  test("the commit picker", async () => {
    const a = await scenario()
    a.moveTo(a.lineOf("src/alpha.ts", "line 24"))
    await recordsAndReturns(a, () => a.press(KEY.ctrlG, "j", KEY.enter))
    expect(a.state().viewingCommit).toBe("aaa1111")
  })

  test("the occurrence picker", async () => {
    const a = await scenario()
    const line = a.lineOf("src/alpha.ts", "needle 5")
    a.moveTo(line, a.mounted.ctx.getLineMapping().getLine(line)!.content.indexOf("needle"))
    await recordsAndReturns(a, () => a.press(KEY.ctrlS, KEY.ctrlN, KEY.enter))
  })

  test("a file picked in the tree", async () => {
    const a = await scenario()
    a.moveTo(a.lineOf("src/alpha.ts", "line 24"))
    a.mounted.show({ focusedPanel: "tree" })
    // j only moves the tree's highlight: the file the cursor is in stays.
    a.press("j", "j", "j")
    expect(a.list().entries).toEqual([])
    await recordsAndReturns(a, () => a.press(KEY.enter))
  })

  // j in the panel moves the diff, but the recorder judges j a step, and a step records only when the file changes.
  test.todo("a thread picked in the thread panel moves the diff", async () => {
    const a = await scenario()
    a.moveTo(a.lineOf("src/alpha.ts", "needle 5"))
    a.press(KEY.ctrlT)
    expect(a.state().inlineCommentOverlay.open).toBe(true)
    // The next thread is further down the same file.
    await recordsAndReturns(a, () => a.press("j"))
  })

  // apply restores the overview first, then clearFileSelection leaves it for the diff again.
  test.todo("a file opened from the PR overview", async () => {
    const { controller } = stubPanel([], { section: "files" })
    const panel = { ...controller, getSelectedFile: () => ({ filename: "src/gamma.ts" }) } as typeof controller
    const a = await scenario({ more: { getPrInfoPanel: () => panel } })
    a.moveTo(a.lineOf("src/alpha.ts", "line 24"))
    a.mounted.show({ viewMode: "state", appMode: "pr" })
    await recordsAndReturns(a, () => a.press("d"))
  })
})

describe("b: plain motions do not record", () => {
  test("j, k, w, b, Ctrl-d, Ctrl-u, Ctrl-e and Ctrl-y inside a file", async () => {
    const a = await scenario()
    a.moveTo(a.lineOf("src/beta.ts", "line 3"))
    a.press("j", "j", "k", "w", "w", "b", KEY.ctrlD, KEY.ctrlU, KEY.ctrlE, KEY.ctrlY)
    expect(a.where().file).toBe("src/beta.ts")
    expect(a.list().entries).toEqual([])
  })
})

describe("c: Ctrl-o from the newest place records it", () => {
  test("so Ctrl-i comes back to it", async () => {
    const a = await scenario()
    const start = a.lineOf("src/alpha.ts", "line 24")
    a.moveTo(start)
    a.press(KEY.G)
    const bottom = a.where()
    a.press(KEY.ctrlO)
    expect(a.where().line).toBe(start)
    expect(a.list().entries.map((entry) => entry.cursorLine)).toEqual([start, bottom.line])
    a.press(KEY.tab)
    expect(a.where()).toEqual(bottom)
    // At the newest end, Ctrl-i does nothing.
    a.press(KEY.tab)
    expect(a.where()).toEqual(bottom)
  })
})

describe("d: a jump made after going back appends, and keeps what was ahead", () => {
  test.todo("Ctrl-o then walks back through every entry", async () => {
    const a = await scenario()
    const first = a.lineOf("src/alpha.ts", "line 3")
    a.moveTo(first)
    a.press("]", "f")
    const second = a.where().line
    a.press("]", "f")
    const third = a.where().line
    a.press(KEY.ctrlO)
    expect(a.where().line).toBe(second)
    a.press(KEY.ctrlO)
    expect(a.where().line).toBe(first)

    a.press(KEY.G)
    const bottom = a.where().line
    // nvim: [first, second, third] with first moved to the end, as it is the place the jump left.
    expect(a.list().entries.map((entry) => entry.cursorLine)).toEqual([second, third, first])
    a.press(KEY.ctrlO)
    expect(a.where().line).toBe(first)
    a.press(KEY.ctrlO)
    expect(a.where().line).toBe(third)
    a.press(KEY.ctrlO)
    expect(a.where().line).toBe(second)
    a.press(KEY.ctrlO)
    expect(a.where().line).toBe(second)
    a.press(KEY.tab, KEY.tab, KEY.tab)
    expect(a.where().line).toBe(bottom)
  })
})

describe("e: a line appears in the list once", () => {
  test.todo("a new jump from a line already in the list drops the older entry, whatever its column", async () => {
    const a = await scenario()
    const start = a.lineOf("src/alpha.ts", "line 24")
    const middle = a.lineOf("src/beta.ts", "line 24")
    a.moveTo(start)
    a.press(KEY.G)
    a.moveTo(middle)
    a.press("g", "g")
    a.moveTo(start, 4)
    a.press(KEY.G)
    const entries = a.list().entries
    expect(entries.map((entry) => entry.cursorLine)).toEqual([middle, start])
    expect(entries[1]!.cursorCol).toBe(4)
  })
})

describe("f: the list holds 100 entries", () => {
  test("the oldest go first", async () => {
    const a = await scenario()
    const lineCount = a.mounted.ctx.getLineMapping().lineCount
    expect(lineCount).toBeGreaterThan(105)
    for (let line = 0; line < 105; line++) {
      a.moveTo(line)
      a.press(KEY.G)
    }
    const lines = a.list().entries.map((entry) => entry.cursorLine)
    expect(lines).toHaveLength(100)
    expect(lines[0]).toBe(5)
    expect(lines[99]).toBe(104)
  })
})

describe("g: Ctrl-o restores the view and the focus the jump was made from", () => {
  test.todo("split or unified", async () => {
    const a = await scenario()
    a.moveTo(a.lineOf("src/alpha.ts", "line 24"))
    a.press("\\")
    expect(a.state().splitView).toBe(true)
    a.press(KEY.G)
    a.press("\\")
    expect(a.state().splitView).toBe(false)
    a.press(KEY.ctrlO)
    expect(a.where().view.split).toBe(true)
  })

  test("single file or all files", async () => {
    const a = await scenario()
    a.mounted.show({ selectedFileIndex: 1, files: a.state().files })
    a.moveTo(a.lineOf("src/beta.ts", "line 24"))
    expect(a.where().view.singleFile).toBe(true)
    // Esc leaves the single file for all of them.
    await recordsAndReturns(a, () => a.press(KEY.escape))
    expect(a.where().view.singleFile).toBe(false)
    a.press(KEY.ctrlO)
    expect(a.where().view.singleFile).toBe(true)
  })

  test.todo("the panel that had focus", async () => {
    const a = await scenario()
    a.moveTo(a.lineOf("src/alpha.ts", "line 24"))
    a.mounted.show({ focusedPanel: "tree" })
    a.press("j", "j", "j", KEY.enter)
    expect(a.where().focus).toBe("diff")
    a.press(KEY.ctrlO)
    expect(a.where().focus).toBe("tree")
  })
})

describe("h: an entry comes back to its line, anchored like a mark", () => {
  /** Records `file`'s line reading `text` with a G from it, then leaves it at the bottom. */
  const recordAt = (a: JumpScenario, file: string, text: string) => {
    a.moveTo(a.lineOf(file, text))
    const place = a.where()
    a.press(KEY.G)
    return place
  }

  test.todo("after a fold above it", async () => {
    const a = await scenario()
    const place = recordAt(a, "src/gamma.ts", "line 24")
    a.mounted.show({ collapsedFiles: new Set(["src/alpha.ts"]), files: a.state().files })
    a.press(KEY.ctrlO)
    expect(a.where().file).toBe(place.file)
    expect(a.where().text).toBe(place.text)
  })

  test("after the wrap toggle", async () => {
    const a = await scenario()
    const place = recordAt(a, "src/gamma.ts", "line 24")
    a.press("z", "w")
    a.press(KEY.ctrlO)
    expect(a.where().file).toBe(place.file)
    expect(a.where().text).toBe(place.text)
  })

  test("after the split toggle", async () => {
    const a = await scenario()
    const place = recordAt(a, "src/gamma.ts", "line 24")
    a.press("\\")
    expect(a.state().splitView).toBe(true)
    a.press(KEY.ctrlO)
    expect(a.where().file).toBe(place.file)
    expect(a.where().text).toBe(place.text)
  })

  test.todo("after a refresh that adds lines above it", async () => {
    const a = await scenario()
    const place = recordAt(a, "src/gamma.ts", "line 24")
    // The refreshed branch has a new file ahead of every other.
    const files = parseDiff(scenarioDiff(["src/aaa.ts", ...SCENARIO_FILES]))
    a.mounted.show({ files, allFiles: files, fileTree: buildFileTree(files) })
    a.press(KEY.ctrlO)
    expect(a.where().file).toBe(place.file)
    expect(a.where().text).toBe(place.text)
  })

  test.todo("an entry whose file left the diff is skipped", async () => {
    const a = await scenario()
    const kept = recordAt(a, "src/alpha.ts", "line 24")
    recordAt(a, "src/beta.ts", "line 24")
    const files = parseDiff(SCENARIO_DIFF).filter((file) => file.filename !== "src/beta.ts")
    a.mounted.show({ files, allFiles: files, fileTree: buildFileTree(files) })
    a.press(KEY.ctrlO)
    expect(a.where().file).toBe(kept.file)
    expect(a.where().text).toBe(kept.text)
  })
})
