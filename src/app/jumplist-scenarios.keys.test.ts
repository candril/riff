import { afterEach, describe, expect, setSystemTime, test } from "bun:test"
import {
  jumpScenario,
  KEY,
  SCENARIO_DIFF,
  SCENARIO_FILES,
  scenarioDiff,
  type JumpScenario,
} from "../testing/jump-scenarios"
import { stubPanel } from "../testing/pr-info-panel-keys"
import { pinStdoutColumns } from "../testing/frame"
import { PR_NOW } from "../testing/pr-info"
import { fullPr } from "../testing/pr-info-panel"
import { PRInfoPanelClass } from "../components/PRInfoPanel"
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

/** `act` jumps; Ctrl-o comes back to where it started, and Ctrl-i goes there again. */
async function recordsAndReturns(a: JumpScenario, act: () => void | Promise<void>) {
  const before = a.where()
  await act()
  await flush()
  const after = a.where()
  expect(after).not.toEqual(before)
  a.press(KEY.ctrlO)
  await flush()
  expect(a.where()).toEqual(before)
  a.press(KEY.tab)
  await flush()
  expect(a.where()).toEqual(after)
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
  test("the comments picker", async () => {
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

  test("a thread picked in the thread panel moves the diff", async () => {
    const a = await scenario()
    a.moveTo(a.lineOf("src/alpha.ts", "needle 5"))
    a.press(KEY.ctrlT)
    expect(a.state().inlineCommentOverlay.open).toBe(true)
    // The next thread is further down the same file.
    await recordsAndReturns(a, () => a.press("j"))
  })

  test("a file opened from the PR overview", async () => {
    const { controller } = stubPanel([], { section: "files" })
    const panel = { ...controller, getSelectedFile: () => ({ filename: "src/gamma.ts" }) } as typeof controller
    const a = await scenario({ more: { getPrInfoPanel: () => panel } })
    a.moveTo(a.lineOf("src/alpha.ts", "line 24"))
    a.mounted.show({ viewMode: "state", appMode: "pr" })
    await recordsAndReturns(a, () => a.press("d"))
  })

  test("]m to a mark further down", async () => {
    const a = await scenario()
    a.moveTo(a.lineOf("src/gamma.ts", "line 43"))
    a.press("m", "a")
    a.moveTo(a.lineOf("src/alpha.ts", "line 3"))
    await recordsAndReturns(a, () => a.press("]", "m"))
    expect(a.where().text).toContain("gamma.ts line 43")
  })

  test("gf on a path:line the diff shows", async () => {
    const notes = [
      "diff --git a/docs/notes.md b/docs/notes.md",
      "new file mode 100644",
      "index 0000000..3333333",
      "--- /dev/null",
      "+++ b/docs/notes.md",
      "@@ -0,0 +1,1 @@",
      "+see src/gamma.ts:25 for the needle",
      "",
    ].join("\n")
    const a = await scenario({ diff: SCENARIO_DIFF + notes })
    const line = a.lineOf("docs/notes.md", "see src/gamma.ts:25")
    a.moveTo(line, a.mounted.ctx.getLineMapping().getLine(line)!.content.indexOf("src/gamma.ts"))
    await recordsAndReturns(a, () => a.press("g", "f"))
    expect(a.where().text).toContain("gamma.ts needle 25")
  })

  // A URL under gf or gx, and every link the links picker lists, opens the browser: not a riff jump.

  test("Enter on a comment in the activity feed", async () => {
    const a = await scenario()
    a.moveTo(a.lineOf("src/alpha.ts", "line 24"))
    const event = { id: "e1", type: "comment" as const, at: "2026-01-02T00:00:00Z", title: "note t3", target: { kind: "comment" as const, commentId: "t3" } }
    a.mounted.show({ viewMode: "feed", appMode: "pr", feed: { ...a.state().feed, events: [event], highlightIndex: 0 } })
    await recordsAndReturns(a, () => a.press(KEY.enter))
    expect(a.where().text).toContain("gamma.ts needle 25")
  })

  // The chat's keys never move the diff. An agent's proposal reveals its line without a key,
  // which spec 089 leaves out as navigation that no key caused.
  // `%` is unbound, and `gd` opens an external diff: neither is a riff jump.
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

describe("b: a fold, an unfold, wrap and the split toggle do not record", () => {
  const notes = [
    "diff --git a/docs/notes.md b/docs/notes.md",
    "new file mode 100644",
    "index 0000000..3333333",
    "--- /dev/null",
    "+++ b/docs/notes.md",
    "@@ -0,0 +1,6 @@",
    "+# Notes",
    "+```mermaid",
    "+sequenceDiagram",
    "+  A->>B: hi",
    "+```",
    "+prose after",
    "",
  ].join("\n")
  const header = (a: JumpScenario, file: string) =>
    a.mounted.ctx.getLineMapping().allLines.findIndex((row) => row.filename === file && row.type === "file-header")

  test("zM then zR with the cursor on a file's header", async () => {
    const a = await scenario()
    a.moveTo(header(a, "src/gamma.ts"))
    a.press("z", KEY.M)
    expect(a.state().collapsedFiles.size).toBeGreaterThan(0)
    expect(a.list().entries).toEqual([])
    a.press("z", KEY.R)
    expect(a.state().collapsedFiles.size).toBe(0)
    expect(a.where().file).toBe("src/gamma.ts")
    expect(a.list().entries).toEqual([])
  })

  test("zm, zr, zc and zo on a file's header", async () => {
    const a = await scenario()
    a.moveTo(header(a, "src/gamma.ts"))
    a.press("z", "m", "z", "r", "z", "c", "z", "o")
    expect(a.list().entries).toEqual([])
  })

  // The fence is the row that stays either way; from a row the fold hides, the cursor lands on another row.
  test("za and zA on a block's fence", async () => {
    const a = await scenario({ diff: SCENARIO_DIFF + notes })
    a.moveTo(a.lineOf("docs/notes.md", "```mermaid"))
    a.press("z", "a")
    expect(a.state().collapsedBlocks.size).toBe(1)
    a.press("z", "a")
    expect(a.state().collapsedBlocks.size).toBe(0)
    a.press("z", KEY.A)
    expect(a.state().collapsedBlocks.size).toBe(1)
    a.press("z", KEY.A)
    expect(a.state().collapsedBlocks.size).toBe(0)
    expect(a.where().text).toContain("```mermaid")
    expect(a.list().entries).toEqual([])
  })

  for (const width of [160, 40]) {
    test(`zw at width ${width}`, async () => {
      const a = await scenario({ width })
      a.moveTo(a.lineOf("src/gamma.ts", "line 24"))
      a.press("z", "w")
      a.press("z", "w")
      expect(a.list().entries).toEqual([])
    })
  }

  test("the scroll commands zz, zt, zb, zh, zl, zH, zL, zs and ze", async () => {
    const a = await scenario()
    a.moveTo(a.lineOf("src/gamma.ts", "line 24"))
    a.press("z", "z", "z", "t", "z", "b", "z", "l", "z", "h", "z", KEY.L, "z", KEY.H, "z", "s", "z", "e")
    expect(a.list().entries).toEqual([])
  })

  test("the split toggle, Ctrl-t and Ctrl-b", async () => {
    const a = await scenario()
    a.moveTo(a.lineOf("src/alpha.ts", "needle 5"))
    a.press("\\")
    expect(a.state().splitView).toBe(true)
    a.press("\\")
    a.press(KEY.ctrlT)
    expect(a.state().inlineCommentOverlay.open).toBe(true)
    a.press(KEY.ctrlT)
    a.press(KEY.ctrlB, KEY.ctrlB)
    expect(a.list().entries).toEqual([])
  })

  test("but zg then g, the z breaking off into gg, is a jump to the top", async () => {
    const a = await scenario()
    a.moveTo(a.lineOf("src/beta.ts", "line 24"))
    await recordsAndReturns(a, () => a.press("z", "g", "g"))
    expect(a.where().line).toBe(0)
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

  test("but not from the newest entry Ctrl-i walked to, however far plain motions moved since", async () => {
    const a = await scenario()
    const start = a.lineOf("src/alpha.ts", "line 24")
    a.moveTo(start)
    // gg rather than G, so j has somewhere to go below the newest entry.
    a.press("g", "g")
    const top = a.where().line
    a.press(KEY.ctrlO)
    a.press(KEY.tab)
    expect(a.where().line).toBe(top)
    a.press("j", "j")
    expect(a.where().line).not.toBe(top)
    a.press(KEY.ctrlO)
    expect(a.where().line).toBe(start)
    expect(a.list().entries.map((entry) => entry.cursorLine)).toEqual([start, top])
  })
})

describe("d: a jump made after going back appends, and keeps what was ahead", () => {
  test("Ctrl-o then walks back through every entry", async () => {
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
  test("a new jump from a line already in the list drops the older entry, whatever its column", async () => {
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
    // A header or a divider is the line above it, as a mark is; only a numbered row is a line of its own.
    const numbered = a.mounted.ctx
      .getLineMapping()
      .allLines.flatMap((row, line) => (row.type === "context" || row.type === "addition" || row.type === "deletion" ? [line] : []))
    expect(numbered.length).toBeGreaterThan(105)
    for (const line of numbered.slice(0, 105)) {
      a.moveTo(line)
      a.press(KEY.G)
    }
    const lines = a.list().entries.map((entry) => entry.cursorLine)
    expect(lines).toHaveLength(100)
    expect(lines[0]).toBe(numbered[5])
    expect(lines[99]).toBe(numbered[104])
  })
})

describe("g: Ctrl-o restores the view and the focus the jump was made from", () => {
  test("split or unified", async () => {
    const a = await scenario()
    // Split draws a removed line beside the one that replaced it; unified stacks them.
    const sideBySide = (frame: string, file: string, n: number) =>
      frame.split("\n").some((row) => row.includes(`${file} old ${n}`) && row.includes(`${file} needle ${n}`))
    a.moveTo(a.lineOf("src/alpha.ts", "line 24"))
    a.press("\\")
    expect(a.state().splitView).toBe(true)
    a.press(KEY.G)
    a.press("\\")
    expect(a.state().splitView).toBe(false)
    const unified = await a.mounted.frame()
    expect(unified).toContain("src/gamma.ts old 65")
    expect(sideBySide(unified, "src/gamma.ts", 65)).toBe(false)
    a.press(KEY.ctrlO)
    expect(a.where().view.split).toBe(true)
    expect(sideBySide(await a.mounted.frame(), "src/alpha.ts", 25)).toBe(true)
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

  test("the panel that had focus", async () => {
    const a = await scenario()
    a.moveTo(a.lineOf("src/alpha.ts", "line 24"))
    a.mounted.show({ focusedPanel: "tree" })
    a.press("j", "j", "j", KEY.enter)
    expect(a.where().focus).toBe("diff")
    a.press(KEY.ctrlO)
    expect(a.where().focus).toBe("tree")
    // The tree binds neither Tab nor Ctrl-i, so the walk forward reaches riff's own keys from it.
    a.press(KEY.tab)
    expect(a.where().focus).toBe("diff")
  })

  test("the thread panel, while it is open", async () => {
    const a = await scenario()
    a.moveTo(a.lineOf("src/alpha.ts", "needle 5"))
    a.press(KEY.ctrlT)
    expect(a.where().focus).toBe("comments")
    // Ctrl-f is the file picker's from the panel too.
    await recordsAndReturns(a, () => a.press(KEY.ctrlF, KEY.ctrlN, KEY.enter))
    a.press(KEY.ctrlO)
    expect(a.state().inlineCommentOverlay.open).toBe(true)
    expect(a.where().focus).toBe("comments")
  })

  test("the feed, with the feed key going back to the overview Ctrl-o left", async () => {
    setSystemTime(PR_NOW)
    const restoreColumns = pinStdoutColumns(160)
    let panel: PRInfoPanelClass | null = null
    try {
      const a = await scenario({ more: { getPrInfoPanel: () => panel } })
      const info = fullPr()
      panel = new PRInfoPanelClass(a.mounted.setup.renderer, info, a.state().files, [])
      a.mounted.setPrInfoPanel(panel)
      a.mounted.show({ selectedFileIndex: 0, files: a.state().files, prInfo: info })
      a.moveTo(a.lineOf("src/alpha.ts", "line 24"))
      const event = { id: "e1", type: "comment" as const, at: "2026-01-02T00:00:00Z", title: "note t3", target: { kind: "comment" as const, commentId: "t3" } }
      a.mounted.show({ viewMode: "feed", appMode: "pr", feed: { ...a.state().feed, events: [event], highlightIndex: 0 } })
      a.press(KEY.enter)
      expect(a.where().text).toContain("gamma.ts needle 25")
      // Into the overview without a key, so the entry before is the feed's.
      a.mounted.show({ viewMode: "state", previousView: "diff", focusedPanel: "diff", inlineCommentOverlay: { ...a.state().inlineCommentOverlay, open: false } })
      a.press(KEY.ctrlO)
      expect(a.where().view.mode).toBe("feed")
      expect(await a.mounted.frame()).toContain("1 event · all types")
      a.press("a")
      expect(a.where().view.mode).toBe("state")
      const overview = await a.mounted.frame()
      expect(overview).toContain("Merge status")
      expect(overview).not.toContain("1 event · all types")
    } finally {
      panel?.destroy()
      restoreColumns()
      setSystemTime()
    }
  })

  test("not the thread panel once it has closed", async () => {
    const a = await scenario()
    a.moveTo(a.lineOf("src/alpha.ts", "needle 5"))
    a.press(KEY.ctrlT)
    const before = a.where()
    a.press(KEY.ctrlF, KEY.ctrlN, KEY.enter)
    a.mounted.show({ inlineCommentOverlay: { ...a.state().inlineCommentOverlay, open: false } })
    a.press(KEY.ctrlO)
    expect(a.where()).toEqual({ ...before, focus: "diff" })
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

  test("after a fold above it", async () => {
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

  test("after a refresh that adds lines above it", async () => {
    const a = await scenario()
    const place = recordAt(a, "src/gamma.ts", "line 24")
    // The refreshed branch has a new file ahead of every other.
    const files = parseDiff(scenarioDiff(["src/aaa.ts", ...SCENARIO_FILES]))
    a.mounted.show({ files, allFiles: files, fileTree: buildFileTree(files) })
    a.press(KEY.ctrlO)
    expect(a.where().file).toBe(place.file)
    expect(a.where().text).toBe(place.text)
  })

  test("an entry whose file left the diff is skipped", async () => {
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
