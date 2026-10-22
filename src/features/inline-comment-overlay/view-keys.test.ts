import { describe, expect, test } from "bun:test"
import { setCommentCodePeek, startInlineCompose, startViewFilter } from "../../state"
import { panelState, threadPanelKeys } from "../../testing/thread-panel-keys"

const CTRL = {
  d: "\x04",
  e: "\x05",
  f: "\x06",
  h: "\x1b[104;5u",
  j: "\x1b[106;5u",
  l: "\x0c",
  n: "\x0e",
  o: "\x0f",
  p: "\x10",
  r: "\x12",
  s: "\x13",
  t: "\x14",
  u: "\x15",
}
const ESC = "\x1b"
const ENTER = "\r"
const TAB = "\t"

describe("the thread panel in view mode", () => {
  test("j, down and Ctrl-j move the highlight down and bring the diff cursor; k and up come back", async () => {
    const keys = await threadPanelKeys(panelState())
    keys.press("j")
    expect(keys.overlay().highlightedIndex).toBe(1)
    keys.press("\x1b[B")
    expect(keys.overlay().highlightedIndex).toBe(2)
    keys.press("k")
    keys.press("\x1b[A")
    expect(keys.overlay().highlightedIndex).toBe(0)
    keys.press(CTRL.j)
    expect(keys.overlay().highlightedIndex).toBe(1)
    expect(keys.calls).toEqual(["sync", "sync", "sync", "sync", "sync"])
    expect(keys.leftKeys).toEqual([])
  })

  test("J, K and Ctrl-n jump between threads; Shift-n is swallowed", async () => {
    const keys = await threadPanelKeys(panelState())
    keys.press("J")
    keys.press("K")
    keys.press(CTRL.n)
    keys.press("N")
    expect(keys.calls).toEqual(["adjacent 1", "adjacent -1", "adjacent 1"])
    expect(keys.leftKeys).toEqual([])
  })

  test("G goes to the last entry, gg to the first, and H shows open threads only", async () => {
    const keys = await threadPanelKeys(panelState())
    keys.press("G")
    expect(keys.overlay().highlightedIndex).toBe(2)
    keys.press("g")
    keys.press("g")
    expect(keys.overlay().highlightedIndex).toBe(0)
    keys.press("H")
    expect(keys.calls).toEqual(["sync", "sync", "openOnly"])
  })

  test("Enter and za fold the highlighted thread open and shut", async () => {
    const keys = await threadPanelKeys(panelState(1))
    keys.press(ENTER)
    expect(keys.overlay().expandedThreadIds.has("a")).toBe(true)
    keys.press("z")
    keys.press("a")
    expect(keys.overlay().expandedThreadIds.has("a")).toBe(false)
  })

  test("a bare a with no z before it does nothing and goes nowhere", async () => {
    const keys = await threadPanelKeys(panelState())
    const before = keys.state()
    keys.press("a")
    expect(keys.state()).toBe(before)
    expect(keys.calls).toEqual([])
    expect(keys.leftKeys).toEqual([])
  })

  test("r replies inline on the highlighted thread and R in $EDITOR", async () => {
    const keys = await threadPanelKeys(panelState(2))
    const reply = keys.press("r")
    expect(reply.defaultPrevented).toBe(true)
    expect(keys.overlay().mode).toBe("compose")
    expect(keys.overlay().line).toBe(3)

    const again = await threadPanelKeys(panelState())
    again.press("R")
    expect(again.overlay().open).toBe(false)
    expect(again.calls).toEqual(["replyInEditor"])
  })

  test("e edits the highlighted comment inline and E in $EDITOR", async () => {
    const keys = await threadPanelKeys(panelState())
    expect(keys.press("e").defaultPrevented).toBe(true)
    expect(keys.overlay().mode).toBe("edit")

    const again = await threadPanelKeys(panelState())
    again.press("E")
    expect(again.overlay().open).toBe(false)
    expect(again.calls).toEqual(["editInEditor"])
  })

  test("d deletes, x resolves, y copies a link and n starts a new comment", async () => {
    const keys = await threadPanelKeys(panelState(2))
    keys.press("d")
    keys.press("x")
    keys.press("y")
    const n = keys.press("n")
    expect(keys.calls).toEqual(["delete b", "resolve b", "copyLink b", "new"])
    expect(n.defaultPrevented).toBe(true)
  })

  test("S posts a local comment, leaves a synced one alone, and Ctrl-s is swallowed", async () => {
    const keys = await threadPanelKeys(panelState(1))
    keys.press("S")
    keys.set(panelState(0))
    keys.press("S")
    keys.press(CTRL.s)
    expect(keys.calls).toEqual(["submit ar"])
    expect(keys.leftKeys).toEqual([])
  })

  test("c opens the code the comment was written against, or says there is none", async () => {
    const keys = await threadPanelKeys(panelState())
    expect(keys.press("c").defaultPrevented).toBe(true)
    expect(keys.overlay().codePeekId).toBe("a")

    const none = await threadPanelKeys(panelState(2))
    none.press("c")
    expect(none.overlay().codePeekId).toBeNull()
    expect(none.toast.current()?.message).toBe("No stored context for this comment")
  })

  test("o opens the file in $EDITOR and O the images", async () => {
    const keys = await threadPanelKeys(panelState())
    expect(keys.press("o").defaultPrevented).toBe(true)
    keys.press("O")
    expect(keys.calls).toEqual(["editor a", "images a"])
    expect(keys.leftKeys).toEqual([])
  })

  test("+ reacts and / starts the filter, both prevented so the prompt they open does not type them", async () => {
    const keys = await threadPanelKeys(panelState())
    expect(keys.press("+").defaultPrevented).toBe(true)
    expect(keys.calls).toEqual(["react"])
    expect(keys.press("/").defaultPrevented).toBe(true)
    expect(keys.overlay().filterInput).toBe(true)
  })

  // Under kitty's alternate-key reporting Shift-=, Ctrl-Shift-= and
  // Alt-Shift-= arrive named "=" and spelled "+", and the keypad's keys
  // have names of their own.
  test("+ by its spelling alone reacts, whatever is held, and is prevented", async () => {
    const keys = await threadPanelKeys(panelState())
    for (const sequence of ["\x1b[61:43;2u", "\x1b[61:43;6u", "\x1b[61:43;4u", "\x1b[57413u"]) {
      expect(keys.press(sequence).defaultPrevented).toBe(true)
    }
    expect(keys.calls).toEqual(["react", "react", "react", "react"])
    expect(keys.leftKeys).toEqual([])
  })

  test("a pending g takes a + spelled so, and a pending z gives it its own meaning", async () => {
    const keys = await threadPanelKeys(panelState())
    keys.press("g")
    expect(keys.press("\x1b[61:43;6u").defaultPrevented).toBe(false)
    expect(keys.calls).toEqual([])
    keys.press("z")
    keys.press("\x1b[61:43;2u")
    expect(keys.calls).toEqual(["react"])
  })

  test("the keypad's / starts the filter, not under ctrl, and leaves a pending g pending", async () => {
    const keys = await threadPanelKeys(panelState())
    keys.press("\x1b[57410;5u")
    expect(keys.overlay().filterInput).toBe(false)
    keys.press("g")
    expect(keys.press("\x1b[57410u").defaultPrevented).toBe(true)
    expect(keys.overlay().filterInput).toBe(true)

    const pending = await threadPanelKeys(panelState(2))
    pending.press("g")
    pending.press("\x1b[57410;2u")
    pending.set(panelState(2))
    pending.press("g")
    expect(pending.overlay().highlightedIndex).toBe(0)
  })

  test("g? toggles the help, gx opens the comments' links and gX copies one", async () => {
    const keys = await threadPanelKeys(panelState())
    keys.press("g")
    keys.press("?")
    keys.press("g")
    expect(keys.press("x").defaultPrevented).toBe(true)
    keys.press("g")
    keys.press("X")
    expect(keys.calls).toEqual(["help", "links a open", "links a copy"])
  })

  test("Ctrl-d and Ctrl-u move by half a page and the diff cursor follows", async () => {
    const keys = await threadPanelKeys(panelState())
    keys.press(CTRL.d)
    keys.press(CTRL.u)
    expect(keys.calls).toEqual(["sync", "sync"])
  })

  test("Ctrl-e widens the panel, and backspace and Ctrl-h hand focus back to the diff", async () => {
    const keys = await threadPanelKeys(panelState())
    keys.press(CTRL.e)
    expect(keys.overlay().expanded).toBe(true)
    keys.press("\x7f")
    expect(keys.state().focusedPanel).toBe("diff")

    const kitty = await threadPanelKeys(panelState())
    kitty.press(CTRL.h)
    expect(kitty.state().focusedPanel).toBe("diff")
  })

  test("Esc, q and Ctrl-t close the panel; Q does not", async () => {
    for (const close of [ESC, "q", CTRL.t]) {
      const keys = await threadPanelKeys(panelState())
      keys.press(close)
      expect(keys.overlay().open).toBe(false)
    }
    const keys = await threadPanelKeys(panelState())
    keys.press("Q")
    expect(keys.overlay().open).toBe(true)
  })
})

describe("the panel's filter prompt", () => {
  test("types every key but Esc and Enter: none reaches a command, the chain or a prevent", async () => {
    const keys = await threadPanelKeys(startViewFilter(panelState(), "comments"))
    for (const sequence of ["j", "q", "x", "s", "S", "g", "/", CTRL.p, CTRL.f, CTRL.d]) {
      expect(keys.press(sequence).defaultPrevented).toBe(false)
    }
    expect(keys.calls).toEqual([])
    expect(keys.leftKeys).toEqual([])
    expect(keys.overlay().filterInput).toBe(true)
    expect(keys.overlay().highlightedIndex).toBe(0)
  })

  test("Esc drops the filter and Enter keeps it", async () => {
    const keys = await threadPanelKeys(startViewFilter(panelState(), "comments"))
    expect(keys.press(ESC).defaultPrevented).toBe(true)
    expect(keys.overlay().filterInput).toBe(false)

    const kept = await threadPanelKeys(startViewFilter(panelState(), "comments"))
    expect(kept.press(ENTER).defaultPrevented).toBe(true)
    expect(kept.overlay().filterInput).toBe(false)
  })
})

describe("the code peek over the panel", () => {
  test("only Esc, q and c close it; every other key is swallowed", async () => {
    for (const close of [ESC, "q", "c", "Q"]) {
      const keys = await threadPanelKeys(setCommentCodePeek(panelState(), "a"))
      keys.press(close)
      expect(keys.overlay().codePeekId).toBeNull()
    }
    const keys = await threadPanelKeys(setCommentCodePeek(panelState(), "a"))
    for (const sequence of ["j", "d", "x", "s", CTRL.p, CTRL.f]) keys.press(sequence)
    expect(keys.overlay().codePeekId).toBe("a")
    expect(keys.overlay().highlightedIndex).toBe(0)
    expect(keys.calls).toEqual([])
    expect(keys.leftKeys).toEqual([])
  })
})

describe("what the panel leaves to the chain", () => {
  test("Ctrl-p, Ctrl-f and a bare s pass, s with meta too, and Shift-s does not", async () => {
    const keys = await threadPanelKeys(panelState())
    for (const sequence of [CTRL.p, CTRL.f, "s", "\x1b[115;3u"]) {
      expect(keys.press(sequence).defaultPrevented).toBe(false)
    }
    expect(keys.leftKeys).toEqual(["p", "f", "s", "s"])
  })

  test("Ctrl-o and Tab pass, so the jumplist is walked from the panel", async () => {
    const keys = await threadPanelKeys(panelState())
    for (const sequence of [CTRL.o, TAB]) {
      expect(keys.press(sequence).defaultPrevented).toBe(false)
    }
    expect(keys.calls).toEqual([])
    expect(keys.leftKeys).toEqual(["o", "tab"])
  })

  test("the filter prompt and the code peek keep Ctrl-o and Tab", async () => {
    for (const state of [startViewFilter(panelState(), "comments"), setCommentCodePeek(panelState(), "a")]) {
      const keys = await threadPanelKeys(state)
      keys.press(CTRL.o)
      keys.press(TAB)
      expect(keys.leftKeys).toEqual([])
    }
  })

  test("Ctrl-r passes in view mode and under the code peek, whether the chat is open or not", async () => {
    for (const chatOpen of [false, true]) {
      const keys = await threadPanelKeys(panelState(0, { chatOpen }))
      keys.press(CTRL.r)
      keys.press("\x1b[114;6u")
      keys.set(setCommentCodePeek(keys.state(), "a"))
      keys.press(CTRL.r)
      expect(keys.leftKeys).toEqual(["r", "r", "r"])
    }
  })

  test("under the filter prompt, where the chat stands aside, Ctrl-r and Ctrl-l stay with the panel", async () => {
    const keys = await threadPanelKeys(startViewFilter(panelState(0, { chatOpen: true }), "comments"))
    keys.press(CTRL.r)
    keys.press(CTRL.l)
    expect(keys.leftKeys).toEqual([])
    expect(keys.overlay().filterInput).toBe(true)
  })

  test("Ctrl-l passes only with the chat open; with it closed the panel swallows it", async () => {
    const closed = await threadPanelKeys(panelState())
    closed.press(CTRL.l)
    expect(closed.leftKeys).toEqual([])

    const open = await threadPanelKeys(panelState(0, { chatOpen: true }))
    open.press(CTRL.l)
    expect(open.leftKeys).toEqual(["l"])
  })

  test("nothing is held while the diff has focus or the composer is open", async () => {
    const unfocused = await threadPanelKeys({ ...panelState(), focusedPanel: "diff" })
    unfocused.press("j")
    unfocused.press("q")
    expect(unfocused.leftKeys).toEqual(["j", "q"])
    expect(unfocused.overlay().highlightedIndex).toBe(0)

    const composing = await threadPanelKeys(startInlineCompose(panelState()))
    composing.press("j")
    expect(composing.leftKeys).toEqual(["j"])
    expect(composing.calls).toEqual([])
  })
})

describe("the panel's own chords", () => {
  test("a pending g swallows the j after it", async () => {
    const keys = await threadPanelKeys(panelState())
    keys.press("g")
    keys.press("j")
    expect(keys.overlay().highlightedIndex).toBe(0)
    keys.press("j")
    expect(keys.overlay().highlightedIndex).toBe(1)
  })

  test("a pending z gives the j after it its own meaning", async () => {
    const keys = await threadPanelKeys(panelState())
    keys.press("z")
    keys.press("j")
    expect(keys.overlay().highlightedIndex).toBe(1)
  })

  test("g then y copies a link and leaves the g pending", async () => {
    const keys = await threadPanelKeys(panelState(2))
    keys.press("g")
    keys.press("y")
    expect(keys.calls).toEqual(["copyLink b"])
    keys.press("g")
    expect(keys.overlay().highlightedIndex).toBe(0)
  })

  test("z then g arms the g", async () => {
    const keys = await threadPanelKeys(panelState())
    keys.press("z")
    keys.press("g")
    keys.press("j")
    expect(keys.overlay().highlightedIndex).toBe(0)
  })

  test("a pending g keeps the s that would go to flash, and a pending z lets it go", async () => {
    const keys = await threadPanelKeys(panelState())
    keys.press("g")
    keys.press("s")
    expect(keys.leftKeys).toEqual([])
    keys.press("z")
    keys.press("s")
    expect(keys.leftKeys).toEqual(["s"])
    keys.press("a")
    expect(keys.overlay().expandedThreadIds.size).toBe(0)
  })
})
