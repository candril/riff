import { describe, expect, test } from "bun:test"
import { KeyEvent, parseKeypress } from "@opentui/core"
import { G_SEQUENCES, gChordCommands, type GChordDeps } from "./g-chord-commands"
import { createInitialState, type AppState } from "../state"
import { createComment } from "../types"
import { createCommentsPickerState } from "../features/comments-picker/state"

// Every spelling a g chord accepts, and the command it runs.
const G_SPELLINGS = {
  "gS!": "openReviewPreview",
  "gs!": "openReviewPreview",
  gs: "openSyncPreview",
  go: "openLink",
  gi: "openPrInfo",
  gy: "copyPrUrl",
  "gB!": "openInBoard",
  "gb!": "openInBoard",
  "gY!": "copyPermalink",
  "gy!": "copyPermalink",
  gf: "followLink",
  "gF!": "followLinkInTmux",
  "gf!": "followLinkInTmux",
  gx: "followUrl",
  "gX!": "copyUrl",
  "gx!": "copyUrl",
  ge: "openInEditor",
  "gE!": "openInTmuxWindow",
  "ge!": "openInTmuxWindow",
  gc: "checkoutAndEdit",
  "gC!": "openCommentsPicker",
  "gc!": "openCommentsPicker",
  gd: "diffInEditor",
  "gD!": "diffInTmuxWindow",
  "gd!": "diffInTmuxWindow",
  "gP!": "editOrCreatePr",
  "gp!": "editOrCreatePr",
  gb: "toggleBlamePeek",
  gl: "toggleLinePeek",
  gm: "matchBracket",
  gr: "refresh",
  gg: "goToTop",
  "gG!": "goToBottom",
  "g?": "toggleHelp",
  "g?!": "toggleHelp",
} as const

const PR_INFO = { owner: "o", repo: "r", number: 7 } as AppState["prInfo"]

describe("G_SEQUENCES", () => {
  test("maps every spelling a g chord accepts to the command it runs", () => {
    expect(G_SEQUENCES).toEqual(G_SPELLINGS)
  })

  test("maps both spellings of a shifted letter to one command", () => {
    for (const letter of ["s", "b", "y", "f", "x", "e", "c", "d", "p"]) {
      const upper = G_SEQUENCES[`g${letter.toUpperCase()}!` as keyof typeof G_SEQUENCES]
      expect(upper).toBeDefined()
      expect(G_SEQUENCES[`g${letter}!` as keyof typeof G_SEQUENCES]).toBe(upper)
    }
  })
})

/** The commands over a state of `more`, every action and blame call they make recorded; nothing spawns. */
function gChords(more: Partial<AppState> = {}, blameLink = false) {
  let state: AppState = { ...createInitialState([], [], "test", ""), ...more }
  const ran: string[] = []
  const commentsPicker = createCommentsPickerState()
  const deps = {
    getState: () => state,
    setState: (updater: (s: AppState) => AppState) => {
      state = updater(state)
    },
    render: () => {},
    commentsPicker,
    executeAction: (id: string) => void ran.push(id),
    vimHandler: { jumpToMatchingBracket: () => void ran.push("matchBracket") },
    blame: {
      toggle: () => void ran.push("blame.toggle"),
      openLink: () => {
        ran.push("blame.openLink")
        return blameLink
      },
    },
  } as unknown as GChordDeps
  const key = () => new KeyEvent(parseKeypress("C")!)
  return { commands: gChordCommands(deps), ran, state: () => state, commentsPicker, key }
}

describe("gC", () => {
  test("with no comments does nothing and leaves the key unprevented", () => {
    const { commands, commentsPicker, key } = gChords()
    const pressed = key()
    expect(commands.openCommentsPicker(pressed)).toBe(true)
    expect(pressed.defaultPrevented).toBe(false)
    expect(commentsPicker.open()).toBe(false)
  })

  test("with comments opens the picker and prevents the key", () => {
    const { commands, commentsPicker, key } = gChords({ comments: [createComment("a.ts", 1, "hi")] })
    const pressed = key()
    expect(commands.openCommentsPicker(pressed)).toBe(true)
    expect(pressed.defaultPrevented).toBe(true)
    expect(commentsPicker.open()).toBe(true)
  })
})

test("go in the diff view prefers the blame peek's link", () => {
  const { commands, ran, key } = gChords({ appMode: "pr", prInfo: PR_INFO, viewMode: "diff" }, true)
  expect(commands.openLink(key())).toBe(true)
  expect(ran).toEqual(["blame.openLink"])
})

test("go outside the diff view asks no blame peek", () => {
  const { commands, ran, key } = gChords({ viewMode: "feed" })
  commands.openLink(key())
  expect(ran).toEqual([])
})

describe("outside PR mode", () => {
  test("gi and gy do nothing", () => {
    const { commands, ran, state, key } = gChords({ appMode: "local" })
    const before = state()
    expect(commands.openPrInfo(key())).toBe(true)
    expect(commands.copyPrUrl(key())).toBe(true)
    expect(ran).toEqual([])
    expect(state()).toBe(before)
  })
})

describe("gm", () => {
  test("in the diff with the diff focused, jumps to the matching bracket", () => {
    const { commands, ran, key } = gChords({ viewMode: "diff", focusedPanel: "diff" })
    expect(commands.matchBracket(key())).toBe(true)
    expect(ran).toEqual(["matchBracket"])
  })

  test("anywhere else takes the key and does nothing", () => {
    for (const more of [{ viewMode: "diff", focusedPanel: "tree" }, { viewMode: "feed", focusedPanel: "diff" }] as const) {
      const { commands, ran, key } = gChords(more)
      expect(commands.matchBracket(key())).toBe(true)
      expect(ran).toEqual([])
    }
  })
})

test("gy in PR mode copies the PR's URL", () => {
  const { commands, ran, key } = gChords({ appMode: "pr", prInfo: PR_INFO })
  commands.copyPrUrl(key())
  expect(ran).toEqual(["copy-pr-url"])
})

describe("gP", () => {
  test("edits the PR in PR mode", () => {
    const { commands, ran, key } = gChords({ appMode: "pr", prInfo: PR_INFO })
    commands.editOrCreatePr(key())
    expect(ran).toEqual(["edit-pr"])
  })

  test("creates one in local mode", () => {
    const { commands, ran, key } = gChords({ appMode: "local" })
    commands.editOrCreatePr(key())
    expect(ran).toEqual(["create-pr"])
  })
})

test("gb opens the blame peek only in the diff view", () => {
  const diff = gChords({ viewMode: "diff" })
  diff.commands.toggleBlamePeek(diff.key())
  expect(diff.ran).toEqual(["blame.toggle"])
  const feed = gChords({ viewMode: "feed" })
  feed.commands.toggleBlamePeek(feed.key())
  expect(feed.ran).toEqual([])
})
