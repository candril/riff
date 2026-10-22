import { test, expect, describe } from "bun:test"
import { createInitialState, type AppState } from "../state"
import { createSearchState, type SearchState } from "../vim-diff/search-state"
import { openPromptModel, writePrompt } from "./open-prompt"
import type { PromptKey } from "./prompt-routing"
import { createFilePickerState, type FilePickerState } from "../features/file-picker/state"
import { createCommentsPickerState, type CommentsPickerState } from "../features/comments-picker/state"
import type { PickerSnapshots } from "./frame"

const initial = createInitialState([], [], "test", "")

function promptFor(
  patch: Partial<AppState>,
  search: Partial<SearchState> = {},
  pickers: Partial<PickerSnapshots> = {}
) {
  return openPromptModel({ ...initial, ...patch }, { ...createSearchState(), ...search }, {
    filePicker: null,
    commentsPicker: null,
    ...pickers,
  })
}

describe("which prompt is typing", () => {
  test("the action menu wins over an open picker", () => {
    const prompt = promptFor(
      { actionMenu: { ...initial.actionMenu, open: true, query: "sy" } },
      {},
      { filePicker: createFilePickerState().snapshot() }
    )
    expect(prompt).toEqual({ key: "action-menu:", initialValue: "sy", placeholder: "Search" })
  })

  test("each picker types into its own query", () => {
    expect(promptFor({}, {}, { filePicker: { query: "app", selectedIndex: 0 } })).toEqual({
      key: "file-picker",
      initialValue: "app",
      placeholder: "Type to search…",
    })
    expect(promptFor({}, {}, { commentsPicker: { query: "nit", selectedIndex: 0 } })).toEqual({
      key: "comments-picker",
      initialValue: "nit",
      placeholder: "Type to search…",
    })
    expect(promptFor({ marksPicker: { ...initial.marksPicker, open: true, query: "a" } })).toEqual({
      key: "marks-picker",
      initialValue: "a",
      placeholder: "Type to search…",
    })
  })

  test("the occurrence picker types into its filter while narrowing, and into its search otherwise", () => {
    const occurrence = { ...initial.occurrencePicker, open: true, query: "foo", filter: "src" }
    expect(promptFor({ occurrencePicker: { ...occurrence, narrowing: true } })).toEqual({
      key: "occurrence-picker:narrow",
      initialValue: "src",
      placeholder: "Narrow by path or text, !term to drop…",
    })
    expect(promptFor({ occurrencePicker: { ...occurrence, narrowing: false } })).toEqual({
      key: "occurrence-picker:search",
      initialValue: "foo",
      placeholder: "Search the diff…",
    })
  })

  test("the commit picker types only while its query input is up", () => {
    expect(promptFor({ commitPicker: { ...initial.commitPicker, open: true, queryInput: false } })).toBeNull()
    expect(promptFor({ commitPicker: { ...initial.commitPicker, open: true, queryInput: true, query: "fix" } })).toEqual({
      key: "commit-picker",
      initialValue: "fix",
      placeholder: "Type to search commits…",
    })
  })

  test("the comments filter comes before the feed's", () => {
    const prompt = promptFor({
      inlineCommentOverlay: { ...initial.inlineCommentOverlay, filterInput: true, filter: "bug" },
      feed: { ...initial.feed, filterInput: true },
    })
    expect(prompt).toEqual({ key: "comments-filter", initialValue: "bug", placeholder: "filter comments…" })
    expect(promptFor({ feed: { ...initial.feed, filterInput: true, filter: "ana" } })).toEqual({
      key: "feed-filter",
      initialValue: "ana",
      placeholder: "filter the feed…",
    })
  })

  test("an active search keys its prompt by direction and origin, seeded with what was typed", () => {
    const search = { active: true, direction: "backward" as const, originalLine: 7, originalCol: 3, promptValue: "needle" }
    expect(promptFor({}, search)).toEqual({ key: "search:backward:7:3", initialValue: "needle" })
    expect(promptFor({}, { ...search, direction: "forward" })?.key).toBe("search:forward:7:3")
    expect(promptFor({}, { ...search, originalLine: 8 })?.key).toBe("search:backward:8:3")
  })

  test("with nothing open there is no prompt", () => {
    expect(promptFor({})).toBeNull()
  })
})

describe("where what is typed goes", () => {
  function writer(patch: Partial<AppState> = {}) {
    let state: AppState = { ...initial, occurrencePicker: { ...initial.occurrencePicker, open: true }, ...patch }
    let renders = 0
    const searched: string[] = []
    const pickers = { filePicker: createFilePickerState(), commentsPicker: createCommentsPickerState() }
    const write = writePrompt(
      {
        setState: (updater) => (state = updater(state)),
        ...pickers,
        updateSearchPattern: (value) => void searched.push(value),
      },
      () => renders++
    )
    return { write, state: () => state, pickers, renders: () => renders, searched }
  }

  type Pickers = { filePicker: FilePickerState; commentsPicker: CommentsPickerState }
  const fields: [PromptKey, (s: AppState, pickers: Pickers) => string][] = [
    ["action-menu:", (s) => s.actionMenu.query],
    ["action-menu:react", (s) => s.actionMenu.query],
    ["file-picker", (_s, { filePicker }) => filePicker.query()],
    ["comments-picker", (_s, { commentsPicker }) => commentsPicker.query()],
    ["marks-picker", (s) => s.marksPicker.query],
    ["occurrence-picker:narrow", (s) => s.occurrencePicker.filter],
    ["occurrence-picker:search", (s) => s.occurrencePicker.query],
    ["commit-picker", (s) => s.commitPicker.query],
  ]

  for (const [key, field] of fields) {
    test(`${key} writes its field and renders`, () => {
      const typed = writer()
      typed.write(key, "app")
      expect(field(typed.state(), typed.pickers)).toBe("app")
      expect(typed.renders()).toBe(1)
      expect(typed.searched).toEqual([])
    })
  }

  test("the comments' and the feed's filters write the view filter of what has focus, and render", () => {
    const comments = writer({
      inlineCommentOverlay: { ...initial.inlineCommentOverlay, open: true, filterInput: true },
      focusedPanel: "comments",
    })
    comments.write("comments-filter", "bug")
    expect(comments.state().inlineCommentOverlay.filter).toBe("bug")
    expect(comments.renders()).toBe(1)

    const feed = writer({ viewMode: "feed", feed: { ...initial.feed, filterInput: true } })
    feed.write("feed-filter", "ana")
    expect(feed.state().feed.filter).toBe("ana")
    expect(feed.renders()).toBe(1)
  })

  test("a search goes to the incremental search, which renders itself", () => {
    const typed = writer()
    typed.write("search:forward:0:0", "needles")
    expect(typed.searched).toEqual(["needles"])
    expect(typed.renders()).toBe(0)
  })
})
