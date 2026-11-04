import { describe, expect, test } from "bun:test"
import { overviewState, prInfoPanelKeys } from "../../testing/pr-info-panel-keys"

const CTRL = {
  d: "\x04",
  j: "\x1b[106;5u",
  o: "\x0f",
  p: "\x10",
  r: "\x12",
  u: "\x15",
}
const ESC = "\x1b"
const ENTER = "\r"
const TAB = "\t"
// Under kitty's alternate-key reporting Shift-= and Ctrl-Shift-= arrive
// named "=" and spelled "+"; the keypad's slash is named kpdivide.
const KITTY_PLUS = "\x1b[61:43;2u"
const KITTY_CTRL_PLUS = "\x1b[61:43;6u"
const KEYPAD_SLASH = "\x1b[57410u"
const KITTY_G = "\x1b[71;2u"

describe("the PR overview", () => {
  test("j, down, k and up walk the sections and never reach the chain", async () => {
    const keys = await prInfoPanelKeys(overviewState())
    for (const key of ["j", "\x1b[B", "k", "\x1b[A"]) keys.press(key)
    expect(keys.calls).toEqual(["moveCursor 1", "moveCursor 1", "moveCursor -1", "moveCursor -1"])
    expect(keys.leftKeys).toEqual([])
  })

  test("l opens a folded row and h on it climbs to the header, in any section", async () => {
    const keys = await prInfoPanelKeys(overviewState(), { section: "conversation" })
    keys.press("l")
    keys.press("h")
    keys.panel.section = "files"
    keys.press("l")
    expect(keys.calls).toEqual(["openRow 0", "moveCursorTo -1", "openRow 0"])
  })

  test("x resolves the thread in the conversation and does nothing elsewhere", async () => {
    const keys = await prInfoPanelKeys(overviewState(), { section: "conversation" })
    keys.press("x")
    keys.panel.section = "files"
    keys.press("x")
    expect(keys.calls).toEqual(["resolve t1"])
    expect(keys.leftKeys).toEqual([])
  })

  test("c opens the comment prompt in the conversation and is swallowed elsewhere", async () => {
    const keys = await prInfoPanelKeys(overviewState(), { section: "files" })
    keys.press("c")
    expect(keys.commentInput.isOpen()).toBe(false)
    keys.panel.section = "conversation"
    keys.press("c")
    expect(keys.commentInput.isOpen()).toBe(true)
    expect(keys.leftKeys).toEqual([])
  })

  test("Enter on a file row closes the overview and opens the diff at that file", async () => {
    const keys = await prInfoPanelKeys(overviewState(), { section: "files" })
    keys.press(ENTER)
    expect(keys.calls).toEqual(["jumpToFile src/greet.ts"])
    expect(keys.state().viewMode).not.toBe("state")
  })

  test("Enter, o and y on a preview row ask which link, prevented so the picker does not type them", async () => {
    const keys = await prInfoPanelKeys(overviewState(), { section: "previews" })
    for (const key of [ENTER, "o", "y"]) expect(keys.press(key).defaultPrevented).toBe(true)
    expect(keys.calls).toEqual(["previewRow open vercel", "previewRow open vercel", "previewRow copy vercel"])
  })

  test("Enter deploys a row waiting on demand, and shows a building row's jobs (spec 113)", async () => {
    const deployable = await prInfoPanelKeys(overviewState(), {
      section: "previews",
      preview: { app: "design", links: [], status: "on demand", deploy: { checked: false, line: "- [ ] Deploy design" } },
    })
    deployable.press(ENTER)
    expect(deployable.calls).toEqual(["deploy design"])

    const building = await prInfoPanelKeys(overviewState(), {
      section: "previews",
      preview: { app: "mcp", links: [], status: "building" },
    })
    expect(building.press(ENTER).defaultPrevented).toBe(true)
    expect(building.calls).toEqual(["build mcp"])
  })

  test("Enter on a requested deploy says it is queued rather than asking again", async () => {
    const keys = await prInfoPanelKeys(overviewState(), {
      section: "previews",
      preview: { app: "idp", links: [], status: "on demand", deploy: { checked: true, line: "- [x] Deploy idp" } },
    })
    keys.press(ENTER)
    expect(keys.calls).toEqual([])
    expect(keys.toast.current()?.message).toBe("idp is queued — riff shows it once the bot does")
  })

  test("a bare d opens the diff on a file row and is the chain's anywhere else", async () => {
    const keys = await prInfoPanelKeys(overviewState(), { section: "files" })
    keys.press("d")
    expect(keys.calls).toEqual(["jumpToFile src/greet.ts"])

    const empty = await prInfoPanelKeys(overviewState(), { section: "files", file: false })
    empty.press("d")
    empty.panel.section = "commits"
    empty.press("d")
    expect(empty.leftKeys).toEqual(["d", "d"])
    expect(empty.calls).toEqual([])
  })

  test("G scrolls to the end; a key named G in capitals, which riff's parser never sends, is swallowed", async () => {
    const keys = await prInfoPanelKeys(overviewState())
    keys.press("G")
    expect(keys.calls).toEqual(["scrollTo 120"])
    keys.press(KITTY_G)
    expect(keys.calls).toEqual(["scrollTo 120"])
    expect(keys.leftKeys).toEqual([])
  })

  test("+ reacts and / starts the filter, by name or by spelling, both prevented", async () => {
    const keys = await prInfoPanelKeys(overviewState())
    for (const plus of ["+", KITTY_PLUS]) expect(keys.press(plus).defaultPrevented).toBe(true)
    expect(keys.calls).toEqual(["react", "react"])
    expect(keys.press("/").defaultPrevented).toBe(true)
    expect(keys.prInfoFilter.filterInput()).toBe(true)

    const keypad = await prInfoPanelKeys(overviewState())
    expect(keypad.press(KEYPAD_SLASH).defaultPrevented).toBe(true)
    expect(keypad.prInfoFilter.filterInput()).toBe(true)
  })

  test("Ctrl-Shift-= is a ctrl key, and goes to the chain like every other", async () => {
    const keys = await prInfoPanelKeys(overviewState())
    keys.press(KITTY_CTRL_PLUS)
    expect(keys.calls).toEqual([])
    expect(keys.leftKeys).toEqual(["="])
  })

  test("i, Tab, q, Esc, a and s go to the chain, shifted too; u and every other key are swallowed", async () => {
    const keys = await prInfoPanelKeys(overviewState())
    for (const key of ["i", TAB, "q", ESC, "a", "s", "Q", "S"]) expect(keys.press(key).defaultPrevented).toBe(false)
    expect(keys.leftKeys).toEqual(["i", "tab", "q", "escape", "a", "s", "q", "s"])
    for (const key of ["u", "U", "w", "1", " "]) expect(keys.press(key).defaultPrevented).toBe(false)
    expect(keys.leftKeys).toHaveLength(8)
    expect(keys.calls).toEqual([])
  })

  test("every ctrl key goes to the chain, Ctrl-d and Ctrl-u among them, and leaves a pending g pending", async () => {
    const keys = await prInfoPanelKeys(overviewState())
    keys.press("g")
    for (const key of [CTRL.o, CTRL.p, CTRL.r, CTRL.d, CTRL.u]) keys.press(key)
    expect(keys.leftKeys).toEqual(["o", "p", "r", "d", "u"])
    keys.press("g")
    expect(keys.calls).toEqual(["scrollTo 0"])
  })

  test("nothing is taken outside the overview or while the tree has focus", async () => {
    const diff = await prInfoPanelKeys(overviewState({ viewMode: "diff" }))
    diff.press("j")
    diff.press("/")
    expect(diff.leftKeys).toEqual(["j", "/"])

    const tree = await prInfoPanelKeys(overviewState({ focusedPanel: "tree" }))
    tree.press("j")
    tree.press("x")
    expect(tree.leftKeys).toEqual(["j", "x"])
    expect(tree.calls).toEqual([])
  })
})

describe("the overview's z chord", () => {
  test("za folds the section on its header and opens the row under the cursor", async () => {
    const keys = await prInfoPanelKeys(overviewState(), { onHeader: true })
    keys.press("z")
    keys.press("a")
    keys.panel.onHeader = false
    keys.panel.section = "conversation"
    keys.press("z")
    keys.press("a")
    expect(keys.calls).toEqual(["collapseSection", "openRow 0"])
  })

  test("zo opens the folded row and zc, off a fold, folds the section around it", async () => {
    const keys = await prInfoPanelKeys(overviewState())
    for (const key of ["o", "c"]) {
      keys.press("z")
      keys.press(key)
    }
    expect(keys.calls).toEqual(["openRow 0", "collapseSection"])
  })

  test("zm and zM fold every section, zr and zR unfold every one, as in the diff", async () => {
    const keys = await prInfoPanelKeys(overviewState())
    for (const key of ["m", "M", "r", "R"]) {
      keys.press("z")
      keys.press(key)
    }
    expect(keys.calls).toEqual(["collapseAllSections", "collapseAllSections", "expandAllSections", "expandAllSections"])
  })

  test("zO and zC are swallowed, not read as zo and zc", async () => {
    const keys = await prInfoPanelKeys(overviewState())
    for (const key of ["O", "C"]) {
      keys.press("z")
      keys.press(key)
    }
    expect(keys.calls).toEqual([])
    expect(keys.leftKeys).toEqual([])
  })

  test("any other key after z is swallowed, q and s included", async () => {
    const keys = await prInfoPanelKeys(overviewState())
    for (const key of ["j", "q", "s"]) {
      keys.press("z")
      keys.press(key)
    }
    expect(keys.calls).toEqual([])
    expect(keys.leftKeys).toEqual([])
  })

  test("a z left alone for half a second lapses", async () => {
    const keys = await prInfoPanelKeys(overviewState())
    keys.press("z")
    await Bun.sleep(550)
    keys.press("j")
    expect(keys.calls).toEqual(["moveCursor 1"])
  })
})

describe("the overview's g chord", () => {
  test("g? toggles the help, by name or by spelling", async () => {
    const keys = await prInfoPanelKeys(overviewState())
    keys.press("g")
    keys.press("?")
    keys.press("g")
    keys.press("\x1b[47:63;2u")
    expect(keys.calls).toEqual(["help", "help"])
  })

  test("gr, go and gy run the app's actions, and gb and gB do nothing", async () => {
    const keys = await prInfoPanelKeys(overviewState())
    for (const key of ["r", "o", "y", "B", "b"]) {
      keys.press("g")
      keys.press(key)
    }
    expect(keys.calls).toEqual(["action refresh", "action open-in-browser", "action copy-pr-url"])
  })

  test("gx opens the view's links and gX copies one, prevented for the picker", async () => {
    const keys = await prInfoPanelKeys(overviewState())
    keys.press("g")
    expect(keys.press("x").defaultPrevented).toBe(true)
    keys.press("g")
    expect(keys.press("X").defaultPrevented).toBe(true)
    expect(keys.calls).toEqual(["links open", "links copy"])
  })

  test("any other key after g is swallowed, + and / included", async () => {
    const keys = await prInfoPanelKeys(overviewState())
    for (const key of ["j", "+", KITTY_PLUS, "/", "s"]) {
      keys.press("g")
      expect(keys.press(key).defaultPrevented).toBe(false)
    }
    expect(keys.calls).toEqual([])
    expect(keys.leftKeys).toEqual([])
    expect(keys.prInfoFilter.filterInput()).toBe(false)
  })

  test("a g left alone for half a second lapses", async () => {
    const keys = await prInfoPanelKeys(overviewState())
    keys.press("g")
    await Bun.sleep(550)
    keys.press("j")
    expect(keys.calls).toEqual(["moveCursor 1"])
  })
})

describe("the overview's filter prompt", () => {
  const filtering = async (filter: string) => {
    const keys = await prInfoPanelKeys(overviewState())
    keys.prInfoFilter.set(filter)
    keys.prInfoFilter.start()
    return keys
  }

  test("types every key but Esc and Enter: none reaches a command, the chain or a prevent", async () => {
    const keys = await filtering("")
    for (const key of ["j", "q", "s", "g", "+", "/", CTRL.p, CTRL.r, CTRL.d]) {
      expect(keys.press(key).defaultPrevented).toBe(false)
    }
    expect(keys.calls).toEqual([])
    expect(keys.leftKeys).toEqual([])
    expect(keys.prInfoFilter.filterInput()).toBe(true)
  })

  test("Esc drops the filter and Enter keeps it, both prevented", async () => {
    const keys = await filtering("x")
    expect(keys.press(ESC).defaultPrevented).toBe(true)
    expect(keys.prInfoFilter.filterInput()).toBe(false)
    expect(keys.prInfoFilter.filter()).toBe("")

    const kept = await filtering("x")
    expect(kept.press(ENTER).defaultPrevented).toBe(true)
    expect(kept.prInfoFilter.filterInput()).toBe(false)
    expect(kept.prInfoFilter.filter()).toBe("x")
  })
})

describe("the overview's comment prompt", () => {
  const commenting = async (patch = {}) => {
    const keys = await prInfoPanelKeys(overviewState(patch))
    keys.commentInput.open()
    return keys
  }

  test("types what is pressed, Ctrl-j breaks the line and backspace deletes", async () => {
    const keys = await commenting()
    for (const key of ["h", "i", "q", "s", CTRL.j, "!", "\x7f"]) keys.press(key)
    expect(keys.commentInput.current().text).toBe("hiqs\n")
    expect(keys.leftKeys).toEqual([])
  })

  test("holds every key, ctrl ones too, even with the tree focused", async () => {
    const keys = await commenting({ focusedPanel: "tree" })
    for (const key of ["j", CTRL.r, CTRL.p, TAB]) keys.press(key)
    expect(keys.leftKeys).toEqual([])
    expect(keys.commentInput.current().text).toBe("j\t")
  })

  test("Esc closes it, and Enter with nothing typed leaves it open", async () => {
    const keys = await commenting()
    keys.press(ENTER)
    expect(keys.commentInput.isOpen()).toBe(true)
    keys.press(ESC)
    expect(keys.commentInput.isOpen()).toBe(false)
  })
})

test("the reaction target is whatever the overview's cursor is on when it is asked", async () => {
  const keys = await prInfoPanelKeys(overviewState(), { section: "conversation" })
  expect(keys.reactionTarget()).toEqual({ kind: "review-comment", githubId: 7 })
  keys.panel.section = "files"
  expect(keys.reactionTarget()).toEqual({ kind: "issue", prNumber: 1259 })
})

test("unregistering leaves every key to the chain", async () => {
  const keys = await prInfoPanelKeys(overviewState())
  keys.press("g")
  keys.unregister()
  keys.press("j")
  expect(keys.leftKeys).toEqual(["j"])
})
