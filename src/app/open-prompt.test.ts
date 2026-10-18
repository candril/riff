import { test, expect, describe } from "bun:test"
import { createInitialState, type AppState } from "../state"
import { createSearchState, type SearchState } from "../vim-diff/search-state"
import { openPrompt } from "./open-prompt"

const initial = createInitialState([], [], "test", "")

function promptFor(patch: Partial<AppState>, search: Partial<SearchState> = {}) {
  let state: AppState = { ...initial, ...patch }
  let renders = 0
  const searched: string[] = []
  const prompt = openPrompt(
    state,
    {
      setState: (updater) => (state = updater(state)),
      getSearchState: () => ({ ...createSearchState(), ...search }),
      updateSearchPattern: (value) => searched.push(value),
    },
    () => renders++
  )
  return { prompt, state: () => state, renders: () => renders, searched }
}

describe("which prompt is typing", () => {
  test("the action menu wins over an open picker", () => {
    const { prompt } = promptFor({
      actionMenu: { ...initial.actionMenu, open: true, query: "sy" },
      filePicker: { ...initial.filePicker, open: true },
    })
    expect(prompt?.key).toBe("action-menu:")
    expect(prompt?.initialValue).toBe("sy")
  })

  test("the occurrence picker types into its filter while narrowing, and into its search otherwise", () => {
    const occurrence = { ...initial.occurrencePicker, open: true, query: "foo", filter: "src" }
    const narrowing = promptFor({ occurrencePicker: { ...occurrence, narrowing: true } }).prompt
    expect(narrowing?.key).toBe("occurrence-picker:narrow")
    expect(narrowing?.initialValue).toBe("src")
    const searching = promptFor({ occurrencePicker: { ...occurrence, narrowing: false } }).prompt
    expect(searching?.key).toBe("occurrence-picker:search")
    expect(searching?.initialValue).toBe("foo")
  })

  test("the commit picker types only while its query input is up", () => {
    expect(promptFor({ commitPicker: { ...initial.commitPicker, open: true, queryInput: false } }).prompt).toBeNull()
    expect(promptFor({ commitPicker: { ...initial.commitPicker, open: true, queryInput: true } }).prompt?.key).toBe(
      "commit-picker"
    )
  })

  test("the comments filter comes before the feed's", () => {
    const { prompt } = promptFor({
      inlineCommentOverlay: { ...initial.inlineCommentOverlay, filterInput: true },
      feed: { ...initial.feed, filterInput: true },
    })
    expect(prompt?.key).toBe("comments-filter")
    expect(promptFor({ feed: { ...initial.feed, filterInput: true } }).prompt?.key).toBe("feed-filter")
  })

  test("an active search keys its prompt by direction and origin, seeded with what was typed", () => {
    const { prompt, searched } = promptFor(
      {},
      { active: true, direction: "backward", originalLine: 7, originalCol: 3, promptValue: "needle" }
    )
    expect(prompt?.key).toBe("search:backward:7:3")
    expect(prompt?.initialValue).toBe("needle")
    prompt!.onChange("needles")
    expect(searched).toEqual(["needles"])
  })

  test("with nothing open there is no prompt", () => {
    expect(promptFor({}).prompt).toBeNull()
  })

  test("typing writes through setState and renders", () => {
    const opened = promptFor({ filePicker: { ...initial.filePicker, open: true } })
    opened.prompt!.onChange("app")
    expect(opened.state().filePicker.query).toBe("app")
    expect(opened.renders()).toBe(1)
  })
})
