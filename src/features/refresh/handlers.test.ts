import { describe, expect, test } from "bun:test"
import { createInitialState, type AppState } from "../../state"
import { createHelpState } from "../help/state"
import { createConfirmState } from "../confirm/state"
import { createSyncPreviewState } from "../sync-preview/state"
import { createReviewPreviewState } from "../review-preview/state"
import { createFilePickerState } from "../file-picker/state"
import { createCommentsPickerState } from "../comments-picker/state"
import { createOccurrencePickerState } from "../occurrence-picker/state"
import { createMarksPickerState } from "../marks/picker-state"
import { createCommitPickerState } from "../commit-picker/state"
import { adoptReloadedState } from "./handlers"

describe("a refresh's rebuilt state", () => {
  test("closes the help, which createInitialState no longer resets", () => {
    let state: AppState = createInitialState([], [], "local", "")
    const help = createHelpState()
    help.toggle()
    help.scrollBy(2, 10)
    const ctx = {
      getState: () => state,
      setState: (fn: (s: AppState) => AppState) => { state = fn(state) },
      help,
      confirm: createConfirmState(),
      syncPreview: createSyncPreviewState(),
      reviewPreview: createReviewPreviewState(),
      filePicker: createFilePickerState(),
      commentsPicker: createCommentsPickerState(),
      occurrencePicker: createOccurrencePickerState(),
      marksPicker: createMarksPickerState(),
      commitPicker: createCommitPickerState(),
    }

    adoptReloadedState(ctx, (prev) => ({ ...createInitialState([], [], prev.source, "reloaded") }))

    expect(state.description).toBe("reloaded")
    expect([help.open(), help.scroll()]).toEqual([false, 0])
  })

  test("closes the confirm dialog, which createInitialState no longer resets", () => {
    let state: AppState = createInitialState([], [], "local", "")
    const confirm = createConfirmState()
    confirm.show({ title: "Delete Comment", message: "Sure?", onConfirm() {}, onCancel() {} })
    const ctx = {
      getState: () => state,
      setState: (fn: (s: AppState) => AppState) => { state = fn(state) },
      help: createHelpState(),
      confirm,
      syncPreview: createSyncPreviewState(),
      reviewPreview: createReviewPreviewState(),
      filePicker: createFilePickerState(),
      commentsPicker: createCommentsPickerState(),
      occurrencePicker: createOccurrencePickerState(),
      marksPicker: createMarksPickerState(),
      commitPicker: createCommitPickerState(),
    }

    adoptReloadedState(ctx, (prev) => ({ ...createInitialState([], [], prev.source, "reloaded") }))

    expect(state.description).toBe("reloaded")
    expect(confirm.dialog()).toBeNull()
  })

  test("closes the sync preview, which createInitialState no longer resets", () => {
    let state: AppState = createInitialState([], [], "local", "")
    const syncPreview = createSyncPreviewState()
    syncPreview.show()
    syncPreview.startSync()
    const ctx = {
      getState: () => state,
      setState: (fn: (s: AppState) => AppState) => { state = fn(state) },
      help: createHelpState(),
      confirm: createConfirmState(),
      syncPreview,
      reviewPreview: createReviewPreviewState(),
      filePicker: createFilePickerState(),
      commentsPicker: createCommentsPickerState(),
      occurrencePicker: createOccurrencePickerState(),
      marksPicker: createMarksPickerState(),
      commitPicker: createCommitPickerState(),
    }

    adoptReloadedState(ctx, (prev) => ({ ...createInitialState([], [], prev.source, "reloaded") }))

    expect(state.description).toBe("reloaded")
    expect([syncPreview.open(), syncPreview.loading()]).toEqual([false, false])
  })

  test("closes Submit Review, which createInitialState no longer resets", () => {
    let state: AppState = createInitialState([], [], "local", "")
    const reviewPreview = createReviewPreviewState()
    reviewPreview.show()
    reviewPreview.startSubmit()
    const ctx = {
      getState: () => state,
      setState: (fn: (s: AppState) => AppState) => { state = fn(state) },
      help: createHelpState(),
      confirm: createConfirmState(),
      syncPreview: createSyncPreviewState(),
      reviewPreview,
      filePicker: createFilePickerState(),
      commentsPicker: createCommentsPickerState(),
      occurrencePicker: createOccurrencePickerState(),
      marksPicker: createMarksPickerState(),
      commitPicker: createCommitPickerState(),
    }

    adoptReloadedState(ctx, (prev) => ({ ...createInitialState([], [], prev.source, "reloaded") }))

    expect(state.description).toBe("reloaded")
    expect([reviewPreview.open(), reviewPreview.loading()]).toEqual([false, false])
  })

  test("closes the file picker, which createInitialState no longer resets", () => {
    let state: AppState = createInitialState([], [], "local", "")
    const filePicker = createFilePickerState()
    filePicker.show()
    filePicker.setQuery("app")
    filePicker.move(1, 3)
    const ctx = {
      getState: () => state,
      setState: (fn: (s: AppState) => AppState) => { state = fn(state) },
      help: createHelpState(),
      confirm: createConfirmState(),
      syncPreview: createSyncPreviewState(),
      reviewPreview: createReviewPreviewState(),
      filePicker,
      commentsPicker: createCommentsPickerState(),
      occurrencePicker: createOccurrencePickerState(),
      marksPicker: createMarksPickerState(),
      commitPicker: createCommitPickerState(),
    }

    adoptReloadedState(ctx, (prev) => ({ ...createInitialState([], [], prev.source, "reloaded") }))

    expect(state.description).toBe("reloaded")
    expect(filePicker.open()).toBe(false)
    expect(filePicker.snapshot()).toEqual({ query: "", selectedIndex: 0 })
  })

  test("closes the comments picker, which createInitialState no longer resets", () => {
    let state: AppState = createInitialState([], [], "local", "")
    const commentsPicker = createCommentsPickerState()
    commentsPicker.show()
    commentsPicker.setQuery("nit")
    commentsPicker.move(1, 3)
    const ctx = {
      getState: () => state,
      setState: (fn: (s: AppState) => AppState) => { state = fn(state) },
      help: createHelpState(),
      confirm: createConfirmState(),
      syncPreview: createSyncPreviewState(),
      reviewPreview: createReviewPreviewState(),
      filePicker: createFilePickerState(),
      commentsPicker,
      occurrencePicker: createOccurrencePickerState(),
      marksPicker: createMarksPickerState(),
      commitPicker: createCommitPickerState(),
    }

    adoptReloadedState(ctx, (prev) => ({ ...createInitialState([], [], prev.source, "reloaded") }))

    expect(state.description).toBe("reloaded")
    expect(commentsPicker.open()).toBe(false)
    expect(commentsPicker.snapshot()).toEqual({ query: "", selectedIndex: 0 })
  })

  test("closes the occurrence picker, which createInitialState no longer resets", () => {
    let state: AppState = createInitialState([], [], "local", "")
    const occurrencePicker = createOccurrencePickerState()
    occurrencePicker.show("greeting")
    occurrencePicker.setFilter("src")
    occurrencePicker.toggleNarrowing()
    occurrencePicker.move(1, 3)
    const ctx = {
      getState: () => state,
      setState: (fn: (s: AppState) => AppState) => { state = fn(state) },
      help: createHelpState(),
      confirm: createConfirmState(),
      syncPreview: createSyncPreviewState(),
      reviewPreview: createReviewPreviewState(),
      filePicker: createFilePickerState(),
      commentsPicker: createCommentsPickerState(),
      occurrencePicker,
      marksPicker: createMarksPickerState(),
      commitPicker: createCommitPickerState(),
    }

    adoptReloadedState(ctx, (prev) => ({ ...createInitialState([], [], prev.source, "reloaded") }))

    expect(state.description).toBe("reloaded")
    expect(occurrencePicker.open()).toBe(false)
    expect(occurrencePicker.snapshot()).toEqual({ query: "", filter: "", narrowing: false, selectedIndex: 0 })
  })

  test("closes the marks picker, which createInitialState no longer resets", () => {
    let state: AppState = createInitialState([], [], "local", "")
    const marksPicker = createMarksPickerState()
    marksPicker.show()
    marksPicker.setQuery("needle")
    marksPicker.move(1, 3)
    const ctx = {
      getState: () => state,
      setState: (fn: (s: AppState) => AppState) => { state = fn(state) },
      help: createHelpState(),
      confirm: createConfirmState(),
      syncPreview: createSyncPreviewState(),
      reviewPreview: createReviewPreviewState(),
      filePicker: createFilePickerState(),
      commentsPicker: createCommentsPickerState(),
      occurrencePicker: createOccurrencePickerState(),
      marksPicker,
      commitPicker: createCommitPickerState(),
    }

    adoptReloadedState(ctx, (prev) => ({ ...createInitialState([], [], prev.source, "reloaded") }))

    expect(state.description).toBe("reloaded")
    expect(marksPicker.open()).toBe(false)
    expect(marksPicker.snapshot()).toEqual({ query: "", selectedIndex: 0 })
  })

  test("closes the commit picker, which createInitialState no longer resets", () => {
    let state: AppState = createInitialState([], [], "local", "")
    const commits = [
      { sha: "aaa1111", message: "the last thing", author: "you", date: "2026-09-11T10:00:00Z" },
      { sha: "bbb2222", message: "where it started", author: "you", date: "2026-09-11T09:00:00Z" },
    ]
    const commitPicker = createCommitPickerState()
    commitPicker.show(["bbb2222"], commits)
    commitPicker.startFilter()
    commitPicker.setQuery("last")
    commitPicker.toggleRange("aaa1111")
    const ctx = {
      getState: () => state,
      setState: (fn: (s: AppState) => AppState) => { state = fn(state) },
      help: createHelpState(),
      confirm: createConfirmState(),
      syncPreview: createSyncPreviewState(),
      reviewPreview: createReviewPreviewState(),
      filePicker: createFilePickerState(),
      commentsPicker: createCommentsPickerState(),
      occurrencePicker: createOccurrencePickerState(),
      marksPicker: createMarksPickerState(),
      commitPicker,
    }

    adoptReloadedState(ctx, (prev) => ({ ...createInitialState([], [], prev.source, "reloaded") }))

    expect(state.description).toBe("reloaded")
    expect(commitPicker.open()).toBe(false)
    expect(commitPicker.query()).toBe("")
    expect(commitPicker.queryInput()).toBe(false)
    expect(commitPicker.rangeAnchor()).toBeNull()
  })
})
