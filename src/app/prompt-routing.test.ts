import { test, expect, describe } from "bun:test"
import { createInitialState, type AppState } from "../state"
import { createSearchState } from "../vim-diff/search-state"
import { openPromptModel } from "./open-prompt"
import { ownerOf, promptIslandsOf, promptOwners, routePrompt, type PromptIsland, type PromptKey, type PromptOwner } from "./prompt-routing"
import type { PromptSession } from "./prompt-session"
import { createFilePickerState } from "../features/file-picker/state"
import { createCommentsPickerState } from "../features/comments-picker/state"
import { createOccurrencePickerState } from "../features/occurrence-picker/state"
import { createMarksPickerState } from "../features/marks/picker-state"
import { createCommitPickerState } from "../features/commit-picker/state"
import { createActionMenuState } from "../features/action-menu/state"

const initial = createInitialState([], [], "test", "")

function islands() {
  const calls: [PromptOwner, string | null][] = []
  const record = Object.fromEntries(
    promptOwners.map((owner) => [owner, { prompt: (session: PromptSession | null) => void calls.push([owner, session?.key ?? null]) }])
  ) as unknown as Record<PromptOwner, PromptIsland>
  return { record, calls }
}

describe("routing the open prompt", () => {
  test("closes every other island's prompt before handing the owner its session", () => {
    const { record, calls } = islands()
    routePrompt(record, { key: "occurrence-picker:narrow", initialValue: "", onChange: () => {} })
    expect(calls.at(-1)).toEqual(["occurrence-picker", "occurrence-picker:narrow"])
    expect(calls.slice(0, -1)).toEqual(
      promptOwners.filter((owner) => owner !== "occurrence-picker").map((owner) => [owner, null])
    )
  })

  test("with no prompt open, every island's prompt is closed", () => {
    const { record, calls } = islands()
    routePrompt(record, null)
    expect(calls).toEqual(promptOwners.map((owner) => [owner, null]))
  })

  test("a key's owner is its first segment", () => {
    expect(ownerOf("search:forward:0:0")).toBe("search")
    expect(ownerOf("action-menu:")).toBe("action-menu")
    expect(ownerOf("feed-filter")).toBe("feed-filter")
    // @ts-expect-error a prompt no island owns does not type-check
    const stray: PromptKey = "chat:input"
    expect(String(stray)).toBe("chat:input")
  })

  test("every prompt open-prompt can open has an island, and every island a prompt", () => {
    const states: Partial<AppState>[] = [
      { inlineCommentOverlay: { ...initial.inlineCommentOverlay, filterInput: true } },
      { feed: { ...initial.feed, filterInput: true } },
    ]
    const searching = (active: boolean) => ({ ...createSearchState(), active })
    const closed = { filePicker: null, commentsPicker: null, occurrencePicker: null, marksPicker: null, commitPicker: null, actionMenu: null }
    const occurrence = createOccurrencePickerState().snapshot()
    const opened = [
      ...states.map((patch) => openPromptModel({ ...initial, ...patch }, searching(false), closed)),
      openPromptModel(initial, searching(false), { ...closed, actionMenu: createActionMenuState().snapshot() }),
      openPromptModel(initial, searching(false), { ...closed, filePicker: createFilePickerState().snapshot() }),
      openPromptModel(initial, searching(false), { ...closed, commitPicker: { ...createCommitPickerState().snapshot(), queryInput: true } }),
      openPromptModel(initial, searching(false), { ...closed, commentsPicker: createCommentsPickerState().snapshot() }),
      openPromptModel(initial, searching(false), { ...closed, marksPicker: createMarksPickerState().snapshot() }),
      openPromptModel(initial, searching(false), { ...closed, occurrencePicker: { ...occurrence, narrowing: true } }),
      openPromptModel(initial, searching(false), { ...closed, occurrencePicker: { ...occurrence, narrowing: false } }),
      openPromptModel(initial, searching(true), closed),
    ]
    const owners = new Set(opened.map((prompt) => ownerOf(prompt!.key)))
    expect([...owners].sort()).toEqual([...promptOwners].sort())
  })

  test("each owner's prompt goes to the island that draws it", () => {
    const island = (name: string) => ({ name, prompt() {} })
    const islands = Object.fromEntries(
      ["searchPrompt", "filePicker", "commentsPicker", "marksPicker", "occurrencePicker", "commitPicker", "actionMenu"].map(
        (name) => [name, island(name)]
      )
    ) as unknown as Parameters<typeof promptIslandsOf>[0]
    const names = Object.fromEntries(
      Object.entries(promptIslandsOf(islands, island("feed"), island("threadPanel"))).map(([owner, to]) => [
        owner,
        (to as unknown as { name: string }).name,
      ])
    )
    expect(names).toEqual({
      search: "searchPrompt",
      "file-picker": "filePicker",
      "comments-picker": "commentsPicker",
      "marks-picker": "marksPicker",
      "occurrence-picker": "occurrencePicker",
      "commit-picker": "commitPicker",
      "action-menu": "actionMenu",
      "feed-filter": "feed",
      "comments-filter": "threadPanel",
    })
  })
})
