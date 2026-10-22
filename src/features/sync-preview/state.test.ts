import { describe, expect, test } from "bun:test"
import { createSyncPreviewState } from "./state"

const read = (syncPreview: ReturnType<typeof createSyncPreviewState>) => ({
  open: syncPreview.open(),
  loading: syncPreview.loading(),
})

describe("the sync preview's state", () => {
  test("show opens it idle, startSync marks it loading, and close takes it down", () => {
    const syncPreview = createSyncPreviewState()
    expect(read(syncPreview)).toEqual({ open: false, loading: false })
    syncPreview.show()
    expect(read(syncPreview)).toEqual({ open: true, loading: false })
    syncPreview.startSync()
    expect(read(syncPreview)).toEqual({ open: true, loading: true })
    syncPreview.close()
    expect(read(syncPreview)).toEqual({ open: false, loading: false })
  })

  test("show clears a sync that was still loading when the preview closed", () => {
    const syncPreview = createSyncPreviewState()
    syncPreview.show()
    syncPreview.startSync()
    syncPreview.show()
    expect(read(syncPreview)).toEqual({ open: true, loading: false })
  })
})
