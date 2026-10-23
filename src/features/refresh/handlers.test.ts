import { describe, expect, test } from "bun:test"
import { createInitialState, type AppState } from "../../state"
import { createHelpState } from "../help/state"
import { createConfirmState } from "../confirm/state"
import { createSyncPreviewState } from "../sync-preview/state"
import { createReviewPreviewState } from "../review-preview/state"
import { createPendingReviewState } from "../review-preview/pending-state"
import { createToastState } from "../toast/state"
import { createPrCommentInputState } from "../pr-info-panel/comment-input-state"
import { createFilePickerState } from "../file-picker/state"
import { createCommentsPickerState } from "../comments-picker/state"
import { createOccurrencePickerState } from "../occurrence-picker/state"
import { createMarksPickerState } from "../marks/picker-state"
import { createCommitPickerState } from "../commit-picker/state"
import { createActionMenuState } from "../action-menu/state"
import { createLinePeekState } from "../line-peek/state"
import { createBlamePeekState } from "../blame/peek-state"
import { createBlameColumnsState } from "../blame/column-state"
import { createCommentDraftsState } from "../inline-comment-overlay/drafts-state"
import { createJumpListState } from "../jumplist/state"
import { createLastRefreshState } from "./last-refresh-state"
import { createFeedState } from "../feed/state"
import type { FeedEvent } from "../../utils/feed"
import { adoptReloadedState, rebuildFeedStream } from "./handlers"

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
      pendingReview: createPendingReviewState(),
      toast: createToastState(),
      prCommentInput: createPrCommentInputState(),
      filePicker: createFilePickerState(),
      commentsPicker: createCommentsPickerState(),
      occurrencePicker: createOccurrencePickerState(),
      marksPicker: createMarksPickerState(),
      commitPicker: createCommitPickerState(),
      actionMenu: createActionMenuState(),
      linePeek: createLinePeekState(),
      blamePeek: createBlamePeekState(),
      blameColumns: createBlameColumnsState(),
      commentDrafts: createCommentDraftsState(),
      jumpList: createJumpListState(),
      lastRefresh: createLastRefreshState(),
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
      pendingReview: createPendingReviewState(),
      toast: createToastState(),
      prCommentInput: createPrCommentInputState(),
      filePicker: createFilePickerState(),
      commentsPicker: createCommentsPickerState(),
      occurrencePicker: createOccurrencePickerState(),
      marksPicker: createMarksPickerState(),
      commitPicker: createCommitPickerState(),
      actionMenu: createActionMenuState(),
      linePeek: createLinePeekState(),
      blamePeek: createBlamePeekState(),
      blameColumns: createBlameColumnsState(),
      commentDrafts: createCommentDraftsState(),
      jumpList: createJumpListState(),
      lastRefresh: createLastRefreshState(),
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
      pendingReview: createPendingReviewState(),
      toast: createToastState(),
      prCommentInput: createPrCommentInputState(),
      filePicker: createFilePickerState(),
      commentsPicker: createCommentsPickerState(),
      occurrencePicker: createOccurrencePickerState(),
      marksPicker: createMarksPickerState(),
      commitPicker: createCommitPickerState(),
      actionMenu: createActionMenuState(),
      linePeek: createLinePeekState(),
      blamePeek: createBlamePeekState(),
      blameColumns: createBlameColumnsState(),
      commentDrafts: createCommentDraftsState(),
      jumpList: createJumpListState(),
      lastRefresh: createLastRefreshState(),
    }

    adoptReloadedState(ctx, (prev) => ({ ...createInitialState([], [], prev.source, "reloaded") }))

    expect(state.description).toBe("reloaded")
    expect([syncPreview.open(), syncPreview.loading()]).toEqual([false, false])
  })

  test("closes Submit Review and drops GitHub's pending review, which createInitialState no longer resets", () => {
    let state: AppState = createInitialState([], [], "local", "")
    const reviewPreview = createReviewPreviewState()
    reviewPreview.show()
    reviewPreview.startSubmit()
    const pendingReview = createPendingReviewState()
    pendingReview.set({ id: 7, user: "octo", body: "", comments: [] })
    const ctx = {
      getState: () => state,
      setState: (fn: (s: AppState) => AppState) => { state = fn(state) },
      help: createHelpState(),
      confirm: createConfirmState(),
      syncPreview: createSyncPreviewState(),
      reviewPreview,
      pendingReview,
      toast: createToastState(),
      prCommentInput: createPrCommentInputState(),
      filePicker: createFilePickerState(),
      commentsPicker: createCommentsPickerState(),
      occurrencePicker: createOccurrencePickerState(),
      marksPicker: createMarksPickerState(),
      commitPicker: createCommitPickerState(),
      actionMenu: createActionMenuState(),
      linePeek: createLinePeekState(),
      blamePeek: createBlamePeekState(),
      blameColumns: createBlameColumnsState(),
      commentDrafts: createCommentDraftsState(),
      jumpList: createJumpListState(),
      lastRefresh: createLastRefreshState(),
    }

    adoptReloadedState(ctx, (prev) => ({ ...createInitialState([], [], prev.source, "reloaded") }))

    expect(state.description).toBe("reloaded")
    expect([reviewPreview.open(), reviewPreview.loading()]).toEqual([false, false])
    expect(pendingReview.review()).toBeNull()
  })

  test("clears the toast, which createInitialState no longer resets", () => {
    let state: AppState = createInitialState([], [], "local", "")
    const toast = createToastState()
    toast.show("Refreshing...")
    const ctx = {
      getState: () => state,
      setState: (fn: (s: AppState) => AppState) => { state = fn(state) },
      help: createHelpState(),
      confirm: createConfirmState(),
      syncPreview: createSyncPreviewState(),
      reviewPreview: createReviewPreviewState(),
      pendingReview: createPendingReviewState(),
      toast,
      prCommentInput: createPrCommentInputState(),
      filePicker: createFilePickerState(),
      commentsPicker: createCommentsPickerState(),
      occurrencePicker: createOccurrencePickerState(),
      marksPicker: createMarksPickerState(),
      commitPicker: createCommitPickerState(),
      actionMenu: createActionMenuState(),
      linePeek: createLinePeekState(),
      blamePeek: createBlamePeekState(),
      blameColumns: createBlameColumnsState(),
      commentDrafts: createCommentDraftsState(),
      jumpList: createJumpListState(),
      lastRefresh: createLastRefreshState(),
    }

    adoptReloadedState(ctx, (prev) => ({ ...createInitialState([], [], prev.source, "reloaded") }))

    expect(state.description).toBe("reloaded")
    expect(toast.current()).toBeNull()
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
      pendingReview: createPendingReviewState(),
      toast: createToastState(),
      prCommentInput: createPrCommentInputState(),
      filePicker,
      commentsPicker: createCommentsPickerState(),
      occurrencePicker: createOccurrencePickerState(),
      marksPicker: createMarksPickerState(),
      commitPicker: createCommitPickerState(),
      actionMenu: createActionMenuState(),
      linePeek: createLinePeekState(),
      blamePeek: createBlamePeekState(),
      blameColumns: createBlameColumnsState(),
      commentDrafts: createCommentDraftsState(),
      jumpList: createJumpListState(),
      lastRefresh: createLastRefreshState(),
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
      pendingReview: createPendingReviewState(),
      toast: createToastState(),
      prCommentInput: createPrCommentInputState(),
      filePicker: createFilePickerState(),
      commentsPicker,
      occurrencePicker: createOccurrencePickerState(),
      marksPicker: createMarksPickerState(),
      commitPicker: createCommitPickerState(),
      actionMenu: createActionMenuState(),
      linePeek: createLinePeekState(),
      blamePeek: createBlamePeekState(),
      blameColumns: createBlameColumnsState(),
      commentDrafts: createCommentDraftsState(),
      jumpList: createJumpListState(),
      lastRefresh: createLastRefreshState(),
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
      pendingReview: createPendingReviewState(),
      toast: createToastState(),
      prCommentInput: createPrCommentInputState(),
      filePicker: createFilePickerState(),
      commentsPicker: createCommentsPickerState(),
      occurrencePicker,
      marksPicker: createMarksPickerState(),
      commitPicker: createCommitPickerState(),
      actionMenu: createActionMenuState(),
      linePeek: createLinePeekState(),
      blamePeek: createBlamePeekState(),
      blameColumns: createBlameColumnsState(),
      commentDrafts: createCommentDraftsState(),
      jumpList: createJumpListState(),
      lastRefresh: createLastRefreshState(),
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
      pendingReview: createPendingReviewState(),
      toast: createToastState(),
      prCommentInput: createPrCommentInputState(),
      filePicker: createFilePickerState(),
      commentsPicker: createCommentsPickerState(),
      occurrencePicker: createOccurrencePickerState(),
      marksPicker,
      commitPicker: createCommitPickerState(),
      actionMenu: createActionMenuState(),
      linePeek: createLinePeekState(),
      blamePeek: createBlamePeekState(),
      blameColumns: createBlameColumnsState(),
      commentDrafts: createCommentDraftsState(),
      jumpList: createJumpListState(),
      lastRefresh: createLastRefreshState(),
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
      pendingReview: createPendingReviewState(),
      toast: createToastState(),
      prCommentInput: createPrCommentInputState(),
      filePicker: createFilePickerState(),
      commentsPicker: createCommentsPickerState(),
      occurrencePicker: createOccurrencePickerState(),
      marksPicker: createMarksPickerState(),
      commitPicker,
      actionMenu: createActionMenuState(),
      linePeek: createLinePeekState(),
      blamePeek: createBlamePeekState(),
      blameColumns: createBlameColumnsState(),
      commentDrafts: createCommentDraftsState(),
      jumpList: createJumpListState(),
      lastRefresh: createLastRefreshState(),
    }

    adoptReloadedState(ctx, (prev) => ({ ...createInitialState([], [], prev.source, "reloaded") }))

    expect(state.description).toBe("reloaded")
    expect(commitPicker.open()).toBe(false)
    expect(commitPicker.query()).toBe("")
    expect(commitPicker.queryInput()).toBe(false)
    expect(commitPicker.rangeAnchor()).toBeNull()
  })

  test("closes the command palette, which createInitialState no longer resets", () => {
    let state: AppState = createInitialState([], [], "local", "")
    const actionMenu = createActionMenuState()
    actionMenu.showSubmenu({ kind: "links", links: [], action: "open", title: "Links" })
    actionMenu.setQuery("doc")
    actionMenu.move(1, 3)
    const ctx = {
      getState: () => state,
      setState: (fn: (s: AppState) => AppState) => { state = fn(state) },
      help: createHelpState(),
      confirm: createConfirmState(),
      syncPreview: createSyncPreviewState(),
      reviewPreview: createReviewPreviewState(),
      pendingReview: createPendingReviewState(),
      toast: createToastState(),
      prCommentInput: createPrCommentInputState(),
      filePicker: createFilePickerState(),
      commentsPicker: createCommentsPickerState(),
      occurrencePicker: createOccurrencePickerState(),
      marksPicker: createMarksPickerState(),
      commitPicker: createCommitPickerState(),
      actionMenu,
      linePeek: createLinePeekState(),
      blamePeek: createBlamePeekState(),
      blameColumns: createBlameColumnsState(),
      commentDrafts: createCommentDraftsState(),
      jumpList: createJumpListState(),
      lastRefresh: createLastRefreshState(),
    }

    adoptReloadedState(ctx, (prev) => ({ ...createInitialState([], [], prev.source, "reloaded") }))

    expect(state.description).toBe("reloaded")
    expect(actionMenu.open()).toBe(false)
    expect(actionMenu.snapshot()).toEqual({ query: "", selectedIndex: 0, submenu: null })
  })

  test("closes the line peek, which createInitialState no longer resets", () => {
    let state: AppState = createInitialState([], [], "local", "")
    const linePeek = createLinePeekState()
    linePeek.toggle()
    const ctx = {
      getState: () => state,
      setState: (fn: (s: AppState) => AppState) => { state = fn(state) },
      help: createHelpState(),
      confirm: createConfirmState(),
      syncPreview: createSyncPreviewState(),
      reviewPreview: createReviewPreviewState(),
      pendingReview: createPendingReviewState(),
      toast: createToastState(),
      prCommentInput: createPrCommentInputState(),
      filePicker: createFilePickerState(),
      commentsPicker: createCommentsPickerState(),
      occurrencePicker: createOccurrencePickerState(),
      marksPicker: createMarksPickerState(),
      commitPicker: createCommitPickerState(),
      actionMenu: createActionMenuState(),
      linePeek,
      blamePeek: createBlamePeekState(),
      blameColumns: createBlameColumnsState(),
      commentDrafts: createCommentDraftsState(),
      jumpList: createJumpListState(),
      lastRefresh: createLastRefreshState(),
    }

    adoptReloadedState(ctx, (prev) => ({ ...createInitialState([], [], prev.source, "reloaded") }))

    expect(state.description).toBe("reloaded")
    expect(linePeek.open()).toBe(false)
  })

  test("closes the blame peek, which createInitialState no longer resets", () => {
    let state: AppState = createInitialState([], [], "local", "")
    const blamePeek = createBlamePeekState()
    blamePeek.show({ path: "a.ts", side: "head", line: 1 })
    const ctx = {
      getState: () => state,
      setState: (fn: (s: AppState) => AppState) => { state = fn(state) },
      help: createHelpState(),
      confirm: createConfirmState(),
      syncPreview: createSyncPreviewState(),
      reviewPreview: createReviewPreviewState(),
      pendingReview: createPendingReviewState(),
      toast: createToastState(),
      prCommentInput: createPrCommentInputState(),
      filePicker: createFilePickerState(),
      commentsPicker: createCommentsPickerState(),
      occurrencePicker: createOccurrencePickerState(),
      marksPicker: createMarksPickerState(),
      commitPicker: createCommitPickerState(),
      actionMenu: createActionMenuState(),
      linePeek: createLinePeekState(),
      blamePeek,
      blameColumns: createBlameColumnsState(),
      commentDrafts: createCommentDraftsState(),
      jumpList: createJumpListState(),
      lastRefresh: createLastRefreshState(),
    }

    adoptReloadedState(ctx, (prev) => ({ ...createInitialState([], [], prev.source, "reloaded") }))

    expect(state.description).toBe("reloaded")
    expect(blamePeek.open()).toBe(false)
  })

  test("turns off the blame columns, which createInitialState no longer reaches", () => {
    let state: AppState = createInitialState([], [], "local", "")
    const blameColumns = createBlameColumnsState()
    blameColumns.toggle("a.ts")
    blameColumns.settle("a.ts", { head: [undefined, { kind: "uncommitted" }], base: null })
    expect(blameColumns.columns().get("a.ts")?.status).toBe("ready")
    const ctx = {
      getState: () => state,
      setState: (fn: (s: AppState) => AppState) => { state = fn(state) },
      help: createHelpState(),
      confirm: createConfirmState(),
      syncPreview: createSyncPreviewState(),
      reviewPreview: createReviewPreviewState(),
      pendingReview: createPendingReviewState(),
      toast: createToastState(),
      prCommentInput: createPrCommentInputState(),
      filePicker: createFilePickerState(),
      commentsPicker: createCommentsPickerState(),
      occurrencePicker: createOccurrencePickerState(),
      marksPicker: createMarksPickerState(),
      commitPicker: createCommitPickerState(),
      actionMenu: createActionMenuState(),
      linePeek: createLinePeekState(),
      blamePeek: createBlamePeekState(),
      blameColumns,
      commentDrafts: createCommentDraftsState(),
      jumpList: createJumpListState(),
      lastRefresh: createLastRefreshState(),
    }

    adoptReloadedState(ctx, (prev) => ({ ...createInitialState([], [], prev.source, "reloaded") }))

    expect(state.description).toBe("reloaded")
    expect(blameColumns.columns().size).toBe(0)
  })

  test("drops the kept comment drafts, which a reloaded diff could put on another line", () => {
    let state: AppState = createInitialState([], [], "local", "")
    const commentDrafts = createCommentDraftsState()
    commentDrafts.remember({ filename: "a.ts", line: 1, side: "RIGHT" }, "half a thought")
    commentDrafts.remember({ editingId: "comment-1" }, "a rewrite")
    const ctx = {
      getState: () => state,
      setState: (fn: (s: AppState) => AppState) => { state = fn(state) },
      help: createHelpState(),
      confirm: createConfirmState(),
      syncPreview: createSyncPreviewState(),
      reviewPreview: createReviewPreviewState(),
      pendingReview: createPendingReviewState(),
      toast: createToastState(),
      prCommentInput: createPrCommentInputState(),
      filePicker: createFilePickerState(),
      commentsPicker: createCommentsPickerState(),
      occurrencePicker: createOccurrencePickerState(),
      marksPicker: createMarksPickerState(),
      commitPicker: createCommitPickerState(),
      actionMenu: createActionMenuState(),
      linePeek: createLinePeekState(),
      blamePeek: createBlamePeekState(),
      blameColumns: createBlameColumnsState(),
      commentDrafts,
      jumpList: createJumpListState(),
      lastRefresh: createLastRefreshState(),
    }

    adoptReloadedState(ctx, (prev) => ({ ...createInitialState([], [], prev.source, "reloaded") }))

    expect(state.description).toBe("reloaded")
    expect(commentDrafts.drafts().size).toBe(0)
  })
})

describe("a PR refresh's feed", () => {
  const events: FeedEvent[] = [
    { id: "c1", type: "comment", at: "2026-03-01T11:55:00Z", title: "Rename this" },
    { id: "commit-abc", type: "commit", at: "2026-02-28T10:00:00Z", title: "fix: hunks", target: { kind: "commit", sha: "abc" } },
  ]

  function refreshed(viewMode: AppState["viewMode"]) {
    const state: AppState = { ...createInitialState([], [], "gh:o/r#1", ""), appMode: "pr", viewMode }
    const feed = createFeedState()
    feed.setEvents(events)
    feed.setCommitFiles("abc", [{ filename: "a.ts", additions: 1, deletions: 0 }])
    feed.toggleExpanded("commit-abc")
    feed.toggleType("commit")
    feed.highlight(1)
    let reloads = 0
    rebuildFeedStream({ getState: () => state, feed, reloadFeed: () => void reloads++ })
    return { feed, reloads }
  }

  test("drops the events and the commit files, and keeps the reader's row and filters", () => {
    const { feed } = refreshed("diff")
    expect(feed.events()).toEqual([])
    expect(feed.commitFiles().size).toBe(0)
    expect(feed.snapshot()).toMatchObject({ highlightIndex: 1, types: new Set(["commit"]), expandedIds: new Set(["commit-abc"]) })
  })

  test("re-reads the timeline only while the feed is on screen", () => {
    expect(refreshed("diff").reloads).toBe(0)
    expect(refreshed("state").reloads).toBe(0)
    expect(refreshed("feed").reloads).toBe(1)
  })
})
