import {
  setActionMenuQuery,
  setCommentsPickerQuery,
  setOccurrencePickerQuery,
  setOccurrencePickerFilter,
  setCommitPickerQuery,
  setViewFilter,
} from "../state"
import type { AppState } from "../state"
import type { SearchState } from "../vim-diff/search-state"
import { setMarksPickerQuery } from "../features/marks"
import type { FilePickerSnapshot, FilePickerState } from "../features/file-picker/state"
import { ownerOf, type PromptKey } from "./prompt-routing"

export interface PromptModel {
  key: PromptKey
  initialValue: string
  placeholder?: string
}

/**
 * Which prompt is typing right now. One field types at a time, so at most
 * one of these can be open (spec 065).
 */
export function openPromptModel(
  state: AppState,
  searchState: SearchState,
  filePicker: FilePickerSnapshot | null
): PromptModel | null {
  if (state.actionMenu.open) {
    return {
      key: `action-menu:${state.actionMenu.submenu?.kind ?? ""}`,
      initialValue: state.actionMenu.query,
      placeholder: "Search",
    }
  }
  if (filePicker) {
    return { key: "file-picker", initialValue: filePicker.query, placeholder: "Type to search…" }
  }
  if (state.commentsPicker.open) {
    return { key: "comments-picker", initialValue: state.commentsPicker.query, placeholder: "Type to search…" }
  }
  if (state.marksPicker.open) {
    return { key: "marks-picker", initialValue: state.marksPicker.query, placeholder: "Type to search…" }
  }
  if (state.occurrencePicker.open) {
    return state.occurrencePicker.narrowing
      ? {
          key: "occurrence-picker:narrow",
          initialValue: state.occurrencePicker.filter,
          placeholder: "Narrow by path or text, !term to drop…",
        }
      : {
          key: "occurrence-picker:search",
          initialValue: state.occurrencePicker.query,
          placeholder: "Search the diff…",
        }
  }
  if (state.commitPicker.open && state.commitPicker.queryInput) {
    return { key: "commit-picker", initialValue: state.commitPicker.query, placeholder: "Type to search commits…" }
  }

  if (state.inlineCommentOverlay.filterInput) {
    return { key: "comments-filter", initialValue: state.inlineCommentOverlay.filter, placeholder: "filter comments…" }
  }
  if (state.feed.filterInput) {
    return { key: "feed-filter", initialValue: state.feed.filter, placeholder: "filter the feed…" }
  }

  if (searchState.active) {
    return {
      // A fresh prompt seeds the field; typing into the same one does not.
      key: `search:${searchState.direction}:${searchState.originalLine}:${searchState.originalCol}`,
      initialValue: searchState.promptValue,
    }
  }

  return null
}

/** Whether a prompt is typing right now, so a frame can tell from state alone. */
export function promptOpenIn(
  state: AppState,
  searchState: SearchState,
  filePicker: FilePickerSnapshot | null
): boolean {
  return openPromptModel(state, searchState, filePicker) !== null
}

export type PromptWriteContext = {
  setState: (updater: (s: AppState) => AppState) => void
  filePicker: Pick<FilePickerState, "setQuery">
  /** Incremental search reacting to what the prompt field reports (spec 065). */
  updateSearchPattern: (value: string) => void
}

/** Where what is typed into the prompt `key` goes. */
export function writePrompt(ctx: PromptWriteContext, render: () => void): (key: PromptKey, value: string) => void {
  const typeInto = (set: (s: AppState, value: string) => AppState, value: string) => {
    ctx.setState((s) => set(s, value))
    render()
  }

  return (key, value) => {
    switch (ownerOf(key)) {
      case "action-menu":
        return typeInto(setActionMenuQuery, value)
      case "file-picker":
        ctx.filePicker.setQuery(value)
        return render()
      case "comments-picker":
        return typeInto(setCommentsPickerQuery, value)
      case "marks-picker":
        return typeInto(setMarksPickerQuery, value)
      case "occurrence-picker":
        return typeInto(key === "occurrence-picker:narrow" ? setOccurrencePickerFilter : setOccurrencePickerQuery, value)
      case "commit-picker":
        return typeInto(setCommitPickerQuery, value)
      case "comments-filter":
      case "feed-filter":
        return typeInto(setViewFilter, value)
      case "search":
        return ctx.updateSearchPattern(value)
    }
  }
}
