import { describe, expect, test } from "bun:test"
import { createInitialState, type AppState } from "../../state"
import { createHelpState } from "../help/state"
import { createConfirmState } from "../confirm/state"
import { createSyncPreviewState } from "../sync-preview/state"
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
    }

    adoptReloadedState(ctx, (prev) => ({ ...createInitialState([], [], prev.source, "reloaded") }))

    expect(state.description).toBe("reloaded")
    expect([syncPreview.open(), syncPreview.loading()]).toEqual([false, false])
  })
})
