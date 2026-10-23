import { describe, expect, test } from "bun:test"
import { createHelpState } from "../help/state"
import { createConfirmState } from "../confirm/state"
import { createSyncPreviewState } from "../sync-preview/state"
import { createReviewPreviewState } from "../review-preview/state"
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
import { createPendingReviewState } from "../review-preview/pending-state"
import { createPrCommentInputState } from "../pr-info-panel/comment-input-state"
import { createPrInfoFilterState } from "../pr-info-panel/filter-state"
import { createFileContentState } from "../file-content/state"
import { createCommitDiffsState } from "../commit-scope/diffs-state"
import { closeFeatureOverlays } from "./another-review"

function features() {
  return {
    help: createHelpState(),
    confirm: createConfirmState(),
    syncPreview: createSyncPreviewState(),
    reviewPreview: createReviewPreviewState(),
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
    pendingReview: createPendingReviewState(),
    prCommentInput: createPrCommentInputState(),
    prInfoFilter: createPrInfoFilterState(),
    fileContent: createFileContentState(),
    commitDiffs: createCommitDiffsState(),
  }
}

describe("a switch to another review", () => {
  test("closes every overlay and forgets what the last review left in the factories", () => {
    const f = features()
    f.help.toggle()
    f.confirm.show({ title: "t", message: "m", onConfirm: () => {}, onCancel: () => {} })
    f.syncPreview.show()
    f.reviewPreview.show()
    f.filePicker.show()
    f.commentsPicker.show()
    f.occurrencePicker.show("needle")
    f.marksPicker.show()
    f.commitPicker.show(null, [])
    f.actionMenu.show()
    f.linePeek.toggle()
    f.blamePeek.show({ path: "a.ts", side: "head", line: 1 })
    f.blameColumns.toggle("a.ts")
    f.commentDrafts.remember({ filename: "a.ts", line: 1, side: "RIGHT" }, "half a thought")
    f.jumpList.push({
      fileIndex: 0,
      filename: "a.ts",
      viewingCommit: null,
      viewMode: "diff",
      splitView: false,
      focusedPanel: "diff",
      anchor: null,
      cursorLine: 3,
    })
    f.pendingReview.set({ id: 1, user: "alice", body: "", comments: [] })
    f.prCommentInput.open()
    f.prInfoFilter.start()
    f.prInfoFilter.set("needle")
    f.fileContent.set("a.ts", "new", "old")
    f.fileContent.expand("a.ts:0")
    f.commitDiffs.put("abc1234", [])

    expect(f.help.open()).toBe(true)
    expect(f.confirm.dialog()).not.toBeNull()
    expect(f.syncPreview.open()).toBe(true)
    expect(f.reviewPreview.open()).toBe(true)
    expect(f.filePicker.open()).toBe(true)
    expect(f.commentsPicker.open()).toBe(true)
    expect(f.occurrencePicker.open()).toBe(true)
    expect(f.marksPicker.open()).toBe(true)
    expect(f.commitPicker.open()).toBe(true)
    expect(f.actionMenu.open()).toBe(true)
    expect(f.linePeek.open()).toBe(true)
    expect(f.blamePeek.open()).toBe(true)
    expect(f.blameColumns.columns().size).toBe(1)
    expect(f.commentDrafts.drafts().size).toBe(1)
    expect(f.jumpList.list().entries).toHaveLength(1)
    expect(f.pendingReview.review()).not.toBeNull()
    expect(f.prCommentInput.isOpen()).toBe(true)
    expect(f.prInfoFilter.filter()).toBe("needle")
    expect(f.fileContent.entry("a.ts")).not.toBeNull()
    expect(f.commitDiffs.has("abc1234")).toBe(true)

    closeFeatureOverlays(f)

    expect(f.help.open()).toBe(false)
    expect(f.confirm.dialog()).toBeNull()
    expect(f.syncPreview.open()).toBe(false)
    expect(f.reviewPreview.open()).toBe(false)
    expect(f.filePicker.open()).toBe(false)
    expect(f.commentsPicker.open()).toBe(false)
    expect(f.occurrencePicker.open()).toBe(false)
    expect(f.marksPicker.open()).toBe(false)
    expect(f.commitPicker.open()).toBe(false)
    expect(f.actionMenu.open()).toBe(false)
    expect(f.linePeek.open()).toBe(false)
    expect(f.blamePeek.open()).toBe(false)
    expect(f.blameColumns.columns().size).toBe(0)
    expect(f.commentDrafts.drafts().size).toBe(0)
    expect(f.jumpList.list().entries).toHaveLength(0)
    expect(f.pendingReview.review()).toBeNull()
    expect(f.prCommentInput.isOpen()).toBe(false)
    expect(f.prInfoFilter.filter()).toBe("")
    expect(f.prInfoFilter.filterInput()).toBe(false)
    expect(f.fileContent.entry("a.ts")).toBeNull()
    expect(f.fileContent.expanded().size).toBe(0)
    expect(f.commitDiffs.has("abc1234")).toBe(false)
  })
})
