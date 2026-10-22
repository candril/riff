import { describe, expect, test } from "bun:test"
import { createInitialState, type AppState } from "../state"
import { createCursorState } from "../vim-diff/cursor-state"
import { createSearchState, type SearchState } from "../vim-diff/search-state"
import { createFlashState } from "../vim-diff/flash-state"
import { DiffLineMapping } from "../vim-diff/line-mapping"
import { chatColumnWidth } from "../features/chat/width"
import { statusBarFrameModel } from "./chrome-frame-models"
import { chatColumnFrameModel } from "./panel-frame-models"
import { openPromptModel, promptOpenIn } from "./open-prompt"
import type { Frame } from "./frame"

const initial = createInitialState([], [], "local", "local changes")

function state(patch: Partial<AppState> = {}): AppState {
  return { ...initial, ...patch }
}

function frame(
  appState: AppState,
  { search = {}, diff = { columnInfo: null, selectionInfo: null }, width = 120, help = false }: {
    search?: Partial<SearchState>
    diff?: Frame["diff"]
    width?: number
    help?: boolean
  } = {}
): Frame {
  return {
    state: appState,
    vimState: createCursorState(),
    mapping: new DiffLineMapping([], "all"),
    searchState: { ...createSearchState(), ...search },
    flashState: createFlashState(),
    cachedCurrentUser: null,
    width,
    height: 40,
    now: 0,
    diff,
    help: { open: help, scroll: 0 },
    confirmDialog: null,
  }
}

const found = { pattern: "foo", currentMatchIndex: 1, matches: [{}, {}, {}] as SearchState["matches"], wrapped: true }

describe("statusBarFrameModel", () => {
  test("counts the search's matches only in the diff, and only once a pattern is confirmed", () => {
    expect(statusBarFrameModel(frame(state({ viewMode: "diff" }), { search: found })).searchInfo).toEqual({
      current: 2,
      total: 3,
      pattern: "foo",
      wrapped: true,
    })
    expect(statusBarFrameModel(frame(state({ viewMode: "feed" }), { search: found })).searchInfo).toBeNull()
    expect(statusBarFrameModel(frame(state({ viewMode: "diff" }), { search: { active: true } })).searchInfo).toBeNull()
  })

  test("passes the diff's readout through as the pass read it", () => {
    const diff: Frame["diff"] = { columnInfo: { col: 3, total: 40 }, selectionInfo: { mode: "visual-line", lines: 2 } }
    const model = statusBarFrameModel(frame(state({ viewMode: "diff" }), { diff }))
    expect([model.columnInfo, model.selectionInfo]).toEqual([diff.columnInfo, diff.selectionInfo])
  })
})

describe("chatColumnFrameModel", () => {
  const chatting = (patch: Partial<AppState> = {}) => state({ chatOpen: true, focusedPanel: "chat", ...patch })

  test("is null while the chat is closed", () => {
    expect(chatColumnFrameModel(frame(state({ focusedPanel: "chat" })))).toBeNull()
  })

  test("is as wide as the chat column for the frame's width", () => {
    expect(chatColumnFrameModel(frame(chatting(), { width: 140 }))).toEqual({ width: chatColumnWidth(140), focused: true })
  })

  test("is not focused while the diff has the keys", () => {
    expect(chatColumnFrameModel(frame(chatting({ focusedPanel: "diff" })))?.focused).toBe(false)
  })

  test("gives up the keys to a prompt, a composer or an overlay", () => {
    expect(chatColumnFrameModel(frame(chatting(), { search: { active: true } }))?.focused).toBe(false)
    const composing = chatting({ inlineCommentOverlay: { ...initial.inlineCommentOverlay, open: true, mode: "compose" } })
    expect(chatColumnFrameModel(frame(composing))?.focused).toBe(false)
    expect(chatColumnFrameModel(frame(chatting(), { help: true }))?.focused).toBe(false)
  })
})

describe("promptOpenIn", () => {
  const branches: [string, AppState, Partial<SearchState>, boolean][] = [
    ["the action menu", state({ actionMenu: { ...initial.actionMenu, open: true } }), {}, true],
    ["the file picker", state({ filePicker: { ...initial.filePicker, open: true } }), {}, true],
    ["the comments picker", state({ commentsPicker: { ...initial.commentsPicker, open: true } }), {}, true],
    ["the marks picker", state({ marksPicker: { ...initial.marksPicker, open: true } }), {}, true],
    ["the occurrence picker", state({ occurrencePicker: { ...initial.occurrencePicker, open: true } }), {}, true],
    ["the commit picker's query", state({ commitPicker: { ...initial.commitPicker, open: true, queryInput: true } }), {}, true],
    ["the commit picker's list", state({ commitPicker: { ...initial.commitPicker, open: true, queryInput: false } }), {}, false],
    ["the comments filter", state({ inlineCommentOverlay: { ...initial.inlineCommentOverlay, filterInput: true } }), {}, true],
    ["the feed filter", state({ feed: { ...initial.feed, filterInput: true } }), {}, true],
    ["a search", state(), { active: true }, true],
    ["a confirmed search", state(), { pattern: "foo" }, false],
    ["nothing", state(), {}, false],
  ]

  for (const [name, appState, search, open] of branches) {
    test(`agrees with openPromptModel for ${name}`, () => {
      const searchState = { ...createSearchState(), ...search }
      expect(promptOpenIn(appState, searchState)).toBe(open)
      expect(openPromptModel(appState, searchState) !== null).toBe(open)
    })
  }
})
