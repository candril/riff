import {
  setActionMenuQuery,
  setFilePickerQuery,
  setCommentsPickerQuery,
  setOccurrencePickerQuery,
  setOccurrencePickerFilter,
  setCommitPickerQuery,
  setViewFilter,
} from "../state"
import type { AppState } from "../state"
import type { SearchState } from "../vim-diff/search-state"
import { setMarksPickerQuery } from "../features/marks"
import type { PromptKey } from "./prompt-routing"

export type OpenPromptContext = {
  setState: (updater: (s: AppState) => AppState) => void
  getSearchState: () => SearchState
  updateSearchPattern: (value: string) => void
}

/**
 * Whether a prompt is typing right now: openPrompt's guards, in its order,
 * without the closures, so a frame can tell from state alone.
 */
export function promptOpenIn(state: AppState, searchState: SearchState): boolean {
  return (
    state.actionMenu.open ||
    state.filePicker.open ||
    state.commentsPicker.open ||
    state.marksPicker.open ||
    state.occurrencePicker.open ||
    (state.commitPicker.open && state.commitPicker.queryInput) ||
    state.inlineCommentOverlay.filterInput ||
    state.feed.filterInput ||
    searchState.active
  )
}

/**
 * Which prompt is typing right now, and what it does with what is typed.
 * One field types at a time, so at most one of these can be open (spec 065).
 */
export function openPrompt(
  state: AppState,
  ctx: OpenPromptContext,
  render: () => void
): { key: PromptKey; initialValue: string; placeholder?: string; onChange: (value: string) => void } | null {
  const typeInto = (
    set: (s: AppState, value: string) => AppState
  ): ((value: string) => void) => (value) => {
    ctx.setState((s) => set(s, value))
    render()
  }

  if (state.actionMenu.open) {
    return {
      key: `action-menu:${state.actionMenu.submenu?.kind ?? ""}`,
      initialValue: state.actionMenu.query,
      placeholder: "Search",
      onChange: typeInto(setActionMenuQuery),
    }
  }
  if (state.filePicker.open) {
    return {
      key: "file-picker",
      initialValue: state.filePicker.query,
      placeholder: "Type to search…",
      onChange: typeInto(setFilePickerQuery),
    }
  }
  if (state.commentsPicker.open) {
    return {
      key: "comments-picker",
      initialValue: state.commentsPicker.query,
      placeholder: "Type to search…",
      onChange: typeInto(setCommentsPickerQuery),
    }
  }
  if (state.marksPicker.open) {
    return {
      key: "marks-picker",
      initialValue: state.marksPicker.query,
      placeholder: "Type to search…",
      onChange: typeInto(setMarksPickerQuery),
    }
  }
  if (state.occurrencePicker.open) {
    return state.occurrencePicker.narrowing
      ? {
          key: "occurrence-picker:narrow",
          initialValue: state.occurrencePicker.filter,
          placeholder: "Narrow by path or text, !term to drop…",
          onChange: typeInto(setOccurrencePickerFilter),
        }
      : {
          key: "occurrence-picker:search",
          initialValue: state.occurrencePicker.query,
          placeholder: "Search the diff…",
          onChange: typeInto(setOccurrencePickerQuery),
        }
  }
  if (state.commitPicker.open && state.commitPicker.queryInput) {
    return {
      key: "commit-picker",
      initialValue: state.commitPicker.query,
      placeholder: "Type to search commits…",
      onChange: typeInto(setCommitPickerQuery),
    }
  }

  if (state.inlineCommentOverlay.filterInput) {
    return {
      key: "comments-filter",
      initialValue: state.inlineCommentOverlay.filter,
      placeholder: "filter comments…",
      onChange: typeInto(setViewFilter),
    }
  }
  if (state.feed.filterInput) {
    return {
      key: "feed-filter",
      initialValue: state.feed.filter,
      placeholder: "filter the feed…",
      onChange: typeInto(setViewFilter),
    }
  }

  const searchState = ctx.getSearchState()
  if (searchState.active) {
    return {
      // A fresh prompt seeds the field; typing into the same one does not.
      key: `search:${searchState.direction}:${searchState.originalLine}:${searchState.originalCol}`,
      initialValue: searchState.promptValue,
      onChange: (value) => ctx.updateSearchPattern(value),
    }
  }

  return null
}
