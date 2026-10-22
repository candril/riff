import { describe, expect, test } from "bun:test"
import { createInitialState, openCommitPicker, type AppState } from "../state"
import { createCursorState } from "../vim-diff/cursor-state"
import { createSearchState, type SearchState } from "../vim-diff/search-state"
import { createFlashState, type FlashState } from "../vim-diff/flash-state"
import { DiffLineMapping } from "../vim-diff/line-mapping"
import { X, Y } from "../testing/marks"
import { FRAME_ISLANDS, frameModels, shownByShell } from "./frame-models"
import { overlayModels } from "./overlay-models"
import type { Frame } from "./frame"
import { createFilePickerState } from "../features/file-picker/state"
import { createCommentsPickerState } from "../features/comments-picker/state"
import { createOccurrencePickerState } from "../features/occurrence-picker/state"

const NOW = Date.parse("2026-10-17T12:00:00Z")

function state(patch: Partial<AppState> = {}): AppState {
  return {
    ...createInitialState([X, Y], [], "local", "local changes"),
    commits: [{ sha: "a1b2c3d", message: "Add greeting", author: "octocat", date: new Date(NOW - 5 * 60_000).toISOString() }],
    ...patch,
  }
}

function frame(
  appState: AppState,
  {
    search = {},
    flash = {},
    now = NOW,
    filePicker = null,
    commentsPicker = null,
    occurrencePicker = null,
  }: {
    search?: Partial<SearchState>
    flash?: Partial<FlashState>
    now?: number
    filePicker?: Frame["filePicker"]
    commentsPicker?: Frame["commentsPicker"]
    occurrencePicker?: Frame["occurrencePicker"]
  } = {}
): Frame {
  return {
    state: appState,
    vimState: createCursorState(),
    mapping: new DiffLineMapping([], "all"),
    searchState: { ...createSearchState(), ...search },
    flashState: { ...createFlashState(), ...flash },
    cachedCurrentUser: null,
    width: 120,
    height: 40,
    now,
    diff: { columnInfo: null, selectionInfo: null },
    help: { open: false, scroll: 0 },
    confirmDialog: null,
    syncPreview: null,
    reviewPreview: null,
    filePicker,
    commentsPicker,
    occurrencePicker,
    commandKeys: new Map(),
  }
}

const shown = (models: Record<string, unknown>) =>
  Object.entries(models)
    .filter(([, model]) => model !== null)
    .map(([id]) => id)

describe("frameModels", () => {
  test("puts the composer and the prompt first, which no shell host shows", () => {
    expect(FRAME_ISLANDS.slice(0, 2)).toEqual(["composer", "prompt"])
    expect(shownByShell("composer")).toBe(false)
    expect(shownByShell("prompt")).toBe(false)
  })

  test("carries the open prompt and the composer", () => {
    const models = frameModels(frame(state(), { search: { active: true, promptValue: "foo" } }))
    expect(models.prompt).toEqual({ key: "search:forward:0:0", initialValue: "foo" })
    expect(models.composer).toBeNull()
  })

  test("keys its models in the order the islands update in", () => {
    const keys = Object.keys(frameModels(frame(state())))
    expect(keys).toEqual([...FRAME_ISLANDS])
    expect(keys).toEqual([
      "composer",
      "prompt",
      "feed",
      "threadPanel",
      "prInfoPanel",
      "chatColumn",
      "statusBar",
      "searchPrompt",
      "flashPrompt",
      ...Object.keys(overlayModels(frame(state()))),
      "filePicker",
      "commentsPicker",
      "marksPicker",
      "occurrencePicker",
      "commitPicker",
      "actionMenu",
      "header",
    ])
  })

  test("shows only the PR info panel, the status bar and the header while nothing else is open", () => {
    const models = frameModels(frame(state()))
    expect(shown(models)).toEqual(["prInfoPanel", "statusBar", "header"])
    expect(models.header.left.length).toBeGreaterThan(0)
  })

  test("shows the search line while typing or while a confirmed pattern stays, in the diff only", () => {
    expect(frameModels(frame(state(), { search: { active: true } })).searchPrompt).toMatchObject({ typing: true })
    expect(frameModels(frame(state(), { search: { pattern: "greet" } })).searchPrompt).toMatchObject({
      typing: false,
      pattern: "greet",
    })
    for (const viewMode of ["feed", "state"] as const) {
      expect(frameModels(frame(state({ viewMode }), { search: { active: true, pattern: "greet" } })).searchPrompt).toBeNull()
    }
  })

  test("shows the flash line while flash is active, in the diff only", () => {
    expect(frameModels(frame(state(), { flash: { active: true } })).flashPrompt).toMatchObject({ hint: "type to jump" })
    expect(frameModels(frame(state({ viewMode: "feed" }), { flash: { active: true } })).flashPrompt).toBeNull()
  })

  test("shows each picker and the palette exactly while it is open, with the prompt of those that type", () => {
    expect(shown(frameModels(frame(state(), { filePicker: createFilePickerState().snapshot() })))).toEqual(["prompt", "prInfoPanel", "statusBar", "filePicker", "header"])
    expect(shown(frameModels(frame(state(), { commentsPicker: createCommentsPickerState().snapshot() })))).toEqual(["prompt", "prInfoPanel", "statusBar", "commentsPicker", "header"])
    expect(shown(frameModels(frame(state(), { occurrencePicker: createOccurrencePickerState().snapshot() })))).toEqual(["prompt", "prInfoPanel", "statusBar", "occurrencePicker", "header"])
    expect(shown(frameModels(frame(openCommitPicker(state()))))).toEqual(["prInfoPanel", "statusBar", "commitPicker", "header"])
    const palette = state({ actionMenu: { ...state().actionMenu, open: true } })
    expect(shown(frameModels(frame(palette)))).toEqual(["prompt", "prInfoPanel", "statusBar", "actionMenu", "header"])
  })

  test("dates the commit picker's commits against the frame's clock", () => {
    const at = (now: number) => frameModels(frame(openCommitPicker(state()), { now })).commitPicker!.rows[1]
    expect(at(NOW)).toMatchObject({ sha: "a1b2c3d", time: "5m ago" })
    expect(at(NOW + 60 * 60_000)).toMatchObject({ time: "1h ago" })
  })
})
