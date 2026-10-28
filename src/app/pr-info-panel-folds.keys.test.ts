import { afterEach, beforeEach, describe, expect, setSystemTime, test } from "bun:test"
import { createTestRenderer } from "@opentui/core/testing"
import { PRInfoPanelClass } from "../components/PRInfoPanel"
import type { PrCheck } from "../providers/github/types"
import type { PRInfoPanelSection } from "../state"
import { commits, conversationComments, PR_NOW, prInfo, reviews, reviewThreadComments } from "../testing/pr-info"
import { PR_FILES } from "../testing/pr-info-panel"
import { overviewState, prInfoPanelKeys } from "../testing/pr-info-panel-keys"

// The fold keys on every level of a real panel, through the overview's
// keymap (spec 067): `l`/`h` walk the rows as a tree, `za`/`zo`/`zc` fold
// the row or section under the cursor, `zR`/`zM` (and `zr`/`zm`) every
// section.

// Its annotations are not asked for yet, so opening it has to ask.
const unit = (): PrCheck => ({
  id: 7,
  name: "unit",
  status: "completed",
  conclusion: "failure",
  detailsUrl: null,
  startedAt: null,
  completedAt: null,
})
const lint: PrCheck = { ...unit(), id: 8, name: "lint", conclusion: "success" }

// t1 is unresolved, so the merge status's conversations line opens onto it.
const comments = () => reviewThreadComments().map((c) => (c.id === "t1" ? { ...c, isThreadResolved: false } : c))

const cleanups: (() => void)[] = []
beforeEach(() => {
  setSystemTime(PR_NOW)
})
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  setSystemTime()
})

/** The folded overview on a real panel, the cursor on `section`'s header. */
async function overview(section: PRInfoPanelSection, open: PRInfoPanelSection[] = []) {
  const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({ width: 120, height: 80 })
  const check = unit()
  const info = prInfo("Body line one.\n\nLine two.", {
    reviews: reviews(),
    conversationComments: conversationComments(),
    commits: commits(3),
    checks: [check, lint],
  })
  const panel = new PRInfoPanelClass(renderer, info, PR_FILES, comments(), new Set(open))
  renderer.root.add(panel.getContainer())
  const asked: string[] = []
  // What the app does once the fetch answers, done at once.
  panel.setOnOpenFailingCheck((c) => {
    asked.push(c.name)
    check.annotationsStatus = "loaded"
    check.annotations = [{ path: "src/greet.ts", startLine: 12, endLine: 12, level: "failure", message: "Expected 2" }]
  })
  const keys = await prInfoPanelKeys(overviewState({ prInfo: info }), { controller: panel })
  cleanups.push(() => {
    panel.destroy()
    renderer.destroy()
  })
  panel.setActiveSection(section)
  await renderOnce()

  const z = (key: string) => {
    keys.press("z")
    keys.press(key)
  }
  const at = () => [panel.getActiveSection(), panel.getCursorIndex()]
  const opened = () => {
    const p = panel.capturePosition()
    return {
      sections: [...p.expandedSections].sort(),
      points: [...p.expandedPoints].sort(),
      checks: [...p.expandedCheckIds],
      content: [...p.expandedContent].sort(),
    }
  }
  const frame = async () => {
    await renderOnce()
    return captureCharFrame()
  }
  return { panel, keys, z, at, opened, asked, renderOnce, frame }
}

describe("merge status: header, checks line, failing check, annotation", () => {
  test("l opens each level and steps into it, h climbs back without folding, then folds each on the way up", async () => {
    const { keys, at, opened, asked, panel } = await overview("checks")

    keys.press("l")
    expect(at()).toEqual(["checks", -1])
    expect(opened().sections).toEqual(["checks"])
    keys.press("l")
    expect(at()).toEqual(["checks", 0])
    keys.press("l")
    expect(at()).toEqual(["checks", 1])
    expect(panel.getSelectedCheck()?.name).toBe("unit")
    expect(asked).toEqual([])

    keys.press("l")
    expect(asked).toEqual(["unit"])
    expect(opened().checks).toEqual([7])
    expect(at()).toEqual(["checks", 1])
    keys.press("l")
    expect(at()).toEqual(["checks", 2])
    expect(panel.getSelectedAnnotation()?.annotation.message).toBe("Expected 2")
    keys.press("l")
    expect(at()).toEqual(["checks", 2])

    keys.press("h")
    expect(at()).toEqual(["checks", 1])
    expect(opened().checks).toEqual([7])
    keys.press("h")
    expect(opened().checks).toEqual([])
    expect(at()).toEqual(["checks", 1])
    keys.press("h")
    expect(at()).toEqual(["checks", 0])
    expect(opened().points).toEqual(["checks"])
    keys.press("h")
    expect(opened().points).toEqual([])
    expect(at()).toEqual(["checks", 0])
    keys.press("h")
    expect(at()).toEqual(["checks", -1])
    expect(opened().sections).toEqual(["checks"])
    keys.press("h")
    expect(opened().sections).toEqual([])
    keys.press("h")
    expect(at()).toEqual(["checks", -1])
    expect(opened().sections).toEqual([])
  })

  test("za, zo and zc fold the row or the fold around it, and opening the check asks for annotations once", async () => {
    const { keys, z, at, opened, asked } = await overview("checks", ["checks"])
    keys.press("j")
    keys.press("j")
    z("o")
    expect(asked).toEqual(["unit"])
    expect(opened().checks).toEqual([7])
    z("o")
    expect(opened().checks).toEqual([7])

    keys.press("j")
    z("c")
    expect(at()).toEqual(["checks", 1])
    expect(opened().checks).toEqual([])
    z("a")
    expect(opened().checks).toEqual([7])
    z("a")
    expect(opened().checks).toEqual([])
    z("a")
    keys.press("j")
    z("a")
    expect(at()).toEqual(["checks", 1])
    expect(opened().checks).toEqual([])
    expect(asked).toEqual(["unit"])

    z("c")
    expect(at()).toEqual(["checks", 0])
    expect(opened().points).toEqual([])
    z("a")
    expect(opened().points).toEqual(["checks"])
    expect(at()).toEqual(["checks", 0])

    keys.press("j")
    keys.press("j")
    keys.press("j")
    expect(at()).toEqual(["checks", 3])
    z("c")
    expect(at()).toEqual(["checks", -1])
    expect(opened().sections).toEqual([])
    z("c")
    expect(opened().sections).toEqual([])
    z("o")
    expect(opened().sections).toEqual(["checks"])
    z("o")
    expect(opened().sections).toEqual(["checks"])
    z("c")
    expect(opened().sections).toEqual([])
    z("a")
    expect(opened().sections).toEqual(["checks"])
    z("a")
    expect(opened().sections).toEqual([])
  })
})

describe("merge status: conversations line, thread", () => {
  test("l opens the line and steps onto the thread, h climbs back, zc and za on the thread fold the line", async () => {
    const { keys, z, panel, at, opened } = await overview("checks", ["checks"])
    panel.moveCursorTo(4)
    expect(panel.getSelectedMergeThread()).toBeUndefined()

    keys.press("l")
    expect(opened().points).toEqual(["checks", "conversations"])
    expect(at()).toEqual(["checks", 4])
    keys.press("l")
    expect(at()).toEqual(["checks", 5])
    expect(panel.getSelectedMergeThread()?.id).toBe("t1")
    keys.press("l")
    expect(at()).toEqual(["checks", 5])
    z("o")
    expect(at()).toEqual(["checks", 5])
    keys.press("h")
    expect(at()).toEqual(["checks", 4])
    expect(opened().points).toEqual(["checks", "conversations"])

    keys.press("j")
    z("c")
    expect(at()).toEqual(["checks", 4])
    expect(opened().points).toEqual(["checks"])
    z("a")
    keys.press("j")
    z("a")
    expect(at()).toEqual(["checks", 4])
    expect(opened().points).toEqual(["checks"])
  })
})

describe("conversation: review, its thread, a comment", () => {
  test("a pr-comment opens with l, has no child to step into, and h folds it then climbs", async () => {
    const { keys, at, opened } = await overview("conversation")
    keys.press("l")
    keys.press("l")
    expect(at()).toEqual(["conversation", 0])
    keys.press("l")
    expect(opened().content).toEqual(["501"])
    keys.press("l")
    expect(at()).toEqual(["conversation", 0])
    keys.press("h")
    expect(opened().content).toEqual([])
    expect(at()).toEqual(["conversation", 0])
    keys.press("h")
    expect(at()).toEqual(["conversation", -1])
    expect(opened().sections).toEqual(["conversation"])
  })

  test("a review opens onto its threads, and a thread folds on its own content or climbs to the review", async () => {
    const { keys, z, panel, at, opened } = await overview("conversation", ["conversation"])
    panel.moveCursorTo(4)
    keys.press("l")
    expect(opened().content).toEqual(["PRR_bob2"])
    keys.press("l")
    expect(at()).toEqual(["conversation", 5])
    expect(panel.getSelectedFlatItem()?.type).toBe("review-thread")
    keys.press("l")
    expect(opened().content).toEqual(["PRR_bob2", "t1"])
    keys.press("l")
    expect(at()).toEqual(["conversation", 5])
    keys.press("h")
    expect(opened().content).toEqual(["PRR_bob2"])
    keys.press("h")
    expect(at()).toEqual(["conversation", 4])
    expect(opened().content).toEqual(["PRR_bob2"])

    keys.press("j")
    z("o")
    expect(opened().content).toEqual(["PRR_bob2", "t1"])
    z("c")
    expect(opened().content).toEqual(["PRR_bob2"])
    expect(at()).toEqual(["conversation", 5])
    z("c")
    expect(opened().content).toEqual([])
    expect(at()).toEqual(["conversation", 4])
    z("a")
    keys.press("j")
    z("a")
    expect(opened().content).toEqual(["PRR_bob2", "t1"])
    z("a")
    expect(opened().content).toEqual(["PRR_bob2"])
    expect(at()).toEqual(["conversation", 5])
  })
})

describe("files, commits and description: every row a leaf", () => {
  for (const section of ["files", "commits", "description"] as const) {
    test(`${section}: l opens and steps in, then does nothing; h climbs to the header; zo does nothing on a row; za and zc fold the section`, async () => {
      const { keys, z, at, opened, renderOnce } = await overview(section)
      keys.press("l")
      expect(opened().sections).toEqual([section])
      // The description counts its rows once layout has measured them.
      await renderOnce()
      keys.press("l")
      expect(at()).toEqual([section, 0])
      keys.press("l")
      expect(at()).toEqual([section, 0])
      z("o")
      expect(at()).toEqual([section, 0])
      keys.press("h")
      expect(at()).toEqual([section, -1])
      expect(opened().sections).toEqual([section])

      keys.press("l")
      z("a")
      expect(at()).toEqual([section, -1])
      expect(opened().sections).toEqual([])
      z("o")
      keys.press("l")
      z("c")
      expect(at()).toEqual([section, -1])
      expect(opened().sections).toEqual([])
    })
  }
})

describe("every section at once", () => {
  test("zR and zr open every section, zM and zm fold every one, and the folds inside are kept", async () => {
    const { keys, z, opened } = await overview("checks", ["checks"])
    keys.press("j")
    keys.press("j")
    keys.press("l")
    expect(opened().checks).toEqual([7])
    const all: PRInfoPanelSection[] = ["checks", "commits", "conversation", "description", "files", "previews"]

    z("M")
    expect(opened()).toEqual({ sections: [], points: ["checks"], checks: [7], content: [] })
    z("R")
    expect(opened()).toEqual({ sections: all, points: ["checks"], checks: [7], content: [] })
    z("m")
    expect(opened().sections).toEqual([])
    z("r")
    expect(opened().sections).toEqual(all)
    expect(opened().checks).toEqual([7])
  })
})

describe("a row the filter holds open", () => {
  test("h folds a merge status line the filter opened, and l opens it again", async () => {
    const { panel, keys, at, frame } = await overview("checks")
    panel.setFilter("Rename")
    const thread = "Rename greet to welcome"
    const filtered = await frame()
    expect(filtered).toContain("Conversations")
    expect(filtered.split(thread).length - 1).toBe(2)

    keys.press("j")
    keys.press("h")
    expect(at()).toEqual(["checks", 0])
    expect((await frame()).split(thread).length - 1).toBe(1)
    keys.press("h")
    expect(at()).toEqual(["checks", -1])

    keys.press("j")
    keys.press("l")
    expect((await frame()).split(thread).length - 1).toBe(2)
  })

  test("a changed filter opens a merge status line the reader folded", async () => {
    const { panel, keys, frame } = await overview("checks")
    panel.setFilter("Rename")
    const thread = "Rename greet to welcome"
    keys.press("j")
    keys.press("h")
    expect((await frame()).split(thread).length - 1).toBe(1)

    panel.setFilter("Renam")
    expect([...panel.capturePosition().filterFolded]).toEqual([])
    expect((await frame()).split(thread).length - 1).toBe(2)
  })

  test("zc folds a review the filter opened onto its threads", async () => {
    const { panel, z, at, frame } = await overview("conversation")
    panel.setFilter("farewell")
    expect(await frame()).toContain("Typo here")
    panel.moveCursorTo(0)
    expect(panel.getSelectedFlatItem()?.type).toBe("review-header")

    z("c")
    expect(at()).toEqual(["conversation", 0])
    expect(await frame()).not.toContain("Typo here")
  })
})
