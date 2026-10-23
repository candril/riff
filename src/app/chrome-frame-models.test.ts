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
import type { Frame, PromptSnapshots } from "./frame"
import { createFilePickerState } from "../features/file-picker/state"
import { createCommentsPickerState } from "../features/comments-picker/state"
import { createOccurrencePickerState } from "../features/occurrence-picker/state"
import { createMarksPickerState } from "../features/marks/picker-state"
import { createCommitPickerState } from "../features/commit-picker/state"
import { createActionMenuState } from "../features/action-menu/state"
import { emptyFeed } from "../features/feed/types"

const initial = createInitialState([], [], "local", "local changes")

function state(patch: Partial<AppState> = {}): AppState {
  return { ...initial, ...patch }
}

function frame(
  appState: AppState,
  { search = {}, diff = { columnInfo: null, selectionInfo: null }, width = 120, help = false, chatOpen = false }: {
    search?: Partial<SearchState>
    diff?: Frame["diff"]
    width?: number
    help?: boolean
    chatOpen?: boolean
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
    chatOpen,
    help: { open: help, scroll: 0 },
    confirmDialog: null,
    syncPreview: null,
    reviewPreview: null,
    pendingReview: null,
    toast: null,
    lastRefreshedAt: "",
    prCommentInput: { open: false, text: "", loading: false, error: null },
    prInfoFilter: { filter: "", filterInput: false },
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
    composerPickers: { mention: null, emoji: null },
    commandKeys: new Map(),
    actionFocus: { reactionTarget: null },
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
  const chatting = (patch: Partial<AppState> = {}) => state({ focusedPanel: "chat", ...patch })
  const open = { chatOpen: true }

  test("is null while the chat is closed", () => {
    expect(chatColumnFrameModel(frame(chatting()))).toBeNull()
  })

  test("is as wide as the chat column for the frame's width", () => {
    expect(chatColumnFrameModel(frame(chatting(), { ...open, width: 140 }))).toEqual({ width: chatColumnWidth(140), focused: true })
  })

  test("is not focused while the diff has the keys", () => {
    expect(chatColumnFrameModel(frame(chatting({ focusedPanel: "diff" }), open))?.focused).toBe(false)
  })

  test("gives up the keys to a prompt, a composer or an overlay", () => {
    expect(chatColumnFrameModel(frame(chatting(), { ...open, search: { active: true } }))?.focused).toBe(false)
    const composing = chatting({ inlineCommentOverlay: { ...initial.inlineCommentOverlay, open: true, mode: "compose" } })
    expect(chatColumnFrameModel(frame(composing, open))?.focused).toBe(false)
    expect(chatColumnFrameModel(frame(chatting(), { ...open, help: true }))?.focused).toBe(false)
  })
})

describe("promptOpenIn", () => {
  const commitPicker = (queryInput: boolean) => ({ ...createCommitPickerState().snapshot(), queryInput })
  const closed: PromptSnapshots = { filePicker: null, commentsPicker: null, occurrencePicker: null, marksPicker: null, commitPicker: null, actionMenu: null, feed: emptyFeed() }
  const branches: [string, AppState, Partial<SearchState>, boolean, Partial<PromptSnapshots>?][] = [
    ["the action menu", state(), {}, true, { actionMenu: createActionMenuState().snapshot() }],
    ["the file picker", state(), {}, true, { filePicker: createFilePickerState().snapshot() }],
    ["the comments picker", state(), {}, true, { commentsPicker: createCommentsPickerState().snapshot() }],
    ["the marks picker", state(), {}, true, { marksPicker: createMarksPickerState().snapshot() }],
    ["the occurrence picker", state(), {}, true, { occurrencePicker: createOccurrencePickerState().snapshot() }],
    ["the commit picker's query", state(), {}, true, { commitPicker: commitPicker(true) }],
    ["the commit picker's list", state(), {}, false, { commitPicker: commitPicker(false) }],
    ["the comments filter", state({ inlineCommentOverlay: { ...initial.inlineCommentOverlay, filterInput: true } }), {}, true],
    ["the feed filter", state(), {}, true, { feed: { ...emptyFeed(), filterInput: true } }],
    ["a search", state(), { active: true }, true],
    ["a confirmed search", state(), { pattern: "foo" }, false],
    ["nothing", state(), {}, false],
  ]

  for (const [name, appState, search, open, opened = {}] of branches) {
    test(`agrees with openPromptModel for ${name}`, () => {
      const searchState = { ...createSearchState(), ...search }
      const pickers = { ...closed, ...opened }
      expect(promptOpenIn(appState, searchState, pickers)).toBe(open)
      expect(openPromptModel(appState, searchState, pickers) !== null).toBe(open)
    })
  }
})
