import { afterEach, describe, expect, test } from "bun:test"
import { InputRenderable } from "@opentui/core"
import type { PRInfoPanelClass } from "../components/PRInfoPanel"
import { createInitialState, type AppState } from "../state"
import { createCursorState } from "../vim-diff/cursor-state"
import { createSearchState } from "../vim-diff/search-state"
import { createFlashState, type FlashState } from "../vim-diff/flash-state"
import { DiffLineMapping } from "../vim-diff/line-mapping"
import { PR_FILES, usePrInfoPanel } from "../testing/pr-info-panel"
import { PR_NOW } from "../testing/pr-info"
import { FRAME_ISLANDS } from "./frame-models"
import { followFrame } from "./overlays"
import { createFrame, type Frame } from "./frame"
import { createPrInfoPanelFollower } from "./pr-info-panel-follower"
import { emptyFeed } from "../features/feed/types"

// The PR info panel as the app hands it each published frame: a real panel,
// a real frame, and followFrame between them. Every other island is a stub.

const mount = usePrInfoPanel()

let stops: (() => void)[] = []
afterEach(() => {
  for (const stop of stops) stop()
  stops = []
})

function follow(currentPanel: () => PRInfoPanelClass | null) {
  const { frame, publish } = createFrame()
  const stubs = Object.fromEntries(FRAME_ISLANDS.map((id) => [id, { update() {} }]))
  const islands = { ...stubs, prInfoPanel: createPrInfoPanelFollower(currentPanel) }
  stops.push(followFrame(frame, islands as unknown as Parameters<typeof followFrame>[1], { show() {} }))
  return (
    filter: Partial<Frame["prInfoFilter"]> = {},
    flash: Partial<FlashState> = {},
    prompt: Partial<Frame["prCommentInput"]> = {}
  ) => publish(frameOf(filter, flash, prompt))
}

function frameOf(
  filter: Partial<Frame["prInfoFilter"]>,
  flash: Partial<FlashState>,
  prompt: Partial<Frame["prCommentInput"]>
): Frame {
  const state = { ...createInitialState(PR_FILES, [], "pr", "PR"), viewMode: "state" as const }
  return {
    state,
    vimState: createCursorState(),
    mapping: new DiffLineMapping([], "all"),
    searchState: createSearchState(),
    flashState: { ...createFlashState(), ...flash },
    cachedCurrentUser: null,
    width: 120,
    height: 40,
    now: PR_NOW.getTime(),
    diff: { columnInfo: null, selectionInfo: null },
    chatOpen: false,
    chatExpanded: false,
    help: { open: false, scroll: 0 },
    confirmDialog: null,
    syncPreview: null,
    reviewPreview: null,
    pendingReview: null,
    toast: null,
    lastRefreshedAt: "",
    prCommentInput: { open: false, text: "", loading: false, error: null, ...prompt },
    prInfoFilter: { filter: "", filterInput: false, ...filter },
    filePicker: null,
    commentsPicker: null,
    occurrencePicker: null,
    marksPicker: null,
    marks: [],
    feed: emptyFeed(),
    visit: null,
    commitPicker: null,
    actionMenu: null,
    linePeek: null,
    blamePeek: null,
    mentions: { pool: [], searching: null },
    commentDrafts: new Map(),
    composerText: "",
    composerPickers: { mention: null, emoji: null, symbol: null },
    codePeekId: null,
    commandKeys: new Map(),
    actionFocus: { reactionTarget: null },
  }
}

const LABELS: Partial<FlashState> = {
  active: true,
  surface: "state",
  rows: [
    { id: "checks", label: "a" },
    { id: "files:1", label: "sd" },
  ],
}

describe("the PR info panel following the frame", () => {
  test("draws flash labels while the panel is labelled, and drops them when flash is done", async () => {
    const { panel, mounted } = await mount({ section: "files" })
    const publish = follow(() => panel)

    publish({}, LABELS)
    const labelled = (await mounted.frame()).split("\n")
    expect(labelled).toContainEqual(expect.stringMatching(/^  a ▶  Merge status  ✗ blocked · /))
    expect(labelled).toContain("    sd src/farewell.ts    +5    -0")

    publish({}, { ...LABELS, surface: "comments" })
    const cleared = (await mounted.frame()).split("\n")
    expect(cleared).toContainEqual(expect.stringMatching(/^  ▶  Merge status  ✗ blocked · /))
    expect(cleared).toContain("    src/farewell.ts    +5    -0")
  })

  test("opens the filter box focused on the live filter, narrows the rows to it, and gives focus back on close", async () => {
    const { panel, mounted } = await mount()
    const publish = follow(() => panel)
    const renderer = mounted.setup.renderer

    publish({ filterInput: true, filter: "greet" })
    const lines = (await mounted.frame()).split("\n")
    expect(lines[0]).toBe("  /greet")
    expect(lines).toContain("  ▼  Files (1)")
    expect(lines).toContain("    src/greet.ts    +3    -1")
    expect(lines.join("\n")).not.toContain("src/farewell.ts")
    const focused = renderer.currentFocusedRenderable
    expect(focused).toBeInstanceOf(InputRenderable)
    expect((focused as InputRenderable).value).toBe("greet")

    publish({ filterInput: false, filter: "" })
    const closed = (await mounted.frame()).split("\n")
    expect(closed[0]).toMatch(/^\s*█?$/)
    expect(closed).toContain("  ▼  Files (2)")
    expect(renderer.currentFocusedRenderable).not.toBe(focused)
  })

  test("draws the comment prompt with its text, while submitting and on an error", async () => {
    const { panel, mounted } = await mount()
    const publish = follow(() => panel)
    const prompt = { open: true, text: "hello" }

    publish({}, {}, prompt)
    const open = await mounted.frame()
    expect(open).toContain("Add PR Comment")
    expect(open).toContain("hello")
    expect(open).toContain("Enter to submit")

    publish({}, {}, { ...prompt, loading: true })
    const loading = await mounted.frame()
    expect(loading).toContain("Submitting...")
    expect(loading).not.toContain("Enter to submit")

    publish({}, {}, { ...prompt, error: "boom" })
    const failed = await mounted.frame()
    expect(failed).toContain("boom")
    expect(failed).not.toContain("Enter to submit")

    publish({}, {}, { open: false })
    expect(await mounted.frame()).not.toContain("Add PR Comment")
  })

  test("draws on the panel a reload put in place, and leaves the one it replaced alone", async () => {
    const first = await mount({ section: "files" })
    const second = await mount({ section: "files" })
    let current: PRInfoPanelClass = first.panel
    const publish = follow(() => current)

    publish({}, LABELS)
    const before = await first.mounted.frame()
    expect(before).toContain("    sd src/farewell.ts")

    current = second.panel
    publish({}, LABELS, { open: true, text: "hello" })
    const swapped = await second.mounted.frame()
    expect(swapped).toContain("Add PR Comment")
    expect(swapped).toContain("hello")
    expect(swapped).toMatch(/\n  a ▶  Merge status  ✗ blocked · /)
    expect(await first.mounted.frame()).toBe(before)
  })

  test("does nothing while there is no panel", () => {
    const publish = follow(() => null)
    expect(() => publish({ filterInput: true }, LABELS, { open: true })).not.toThrow()
  })
})
