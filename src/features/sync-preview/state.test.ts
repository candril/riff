import { describe, expect, test } from "bun:test"
import { createSyncPreviewState } from "./state"

const read = (syncPreview: ReturnType<typeof createSyncPreviewState>) => ({
  open: syncPreview.open(),
  loading: syncPreview.loading(),
  error: syncPreview.error(),
})

describe("the sync preview's state", () => {
  test("show opens it idle, startSync marks it loading, and close takes it down", () => {
    const syncPreview = createSyncPreviewState()
    expect(read(syncPreview)).toEqual({ open: false, loading: false, error: null })
    syncPreview.show()
    expect(read(syncPreview)).toEqual({ open: true, loading: false, error: null })
    syncPreview.startSync()
    expect(read(syncPreview)).toEqual({ open: true, loading: true, error: null })
    syncPreview.close()
    expect(read(syncPreview)).toEqual({ open: false, loading: false, error: null })
  })

  test("show clears a sync that was still loading when the preview closed", () => {
    const syncPreview = createSyncPreviewState()
    syncPreview.show()
    syncPreview.startSync()
    syncPreview.show()
    expect(read(syncPreview)).toEqual({ open: true, loading: false, error: null })
  })
})
