/**
 * Sync preview keys: Esc closes, Enter runs the sync. The preview owns the
 * keyboard while it is up, and it has no field to type into.
 */

import type { RiffKeymap } from "../../app/keymap"
import { anyModifiers } from "../../app/key-variants"
import type { AppState } from "../../state"

export interface SyncPreviewKeyDeps {
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
  onExecuteSync: () => void
}

export function registerSyncPreviewKeys(riffKeymap: RiffKeymap, deps: SyncPreviewKeyDeps): () => void {
  const captured = riffKeymap.capture(() => deps.getState().syncPreview.open)
  const unregisterLayer = riffKeymap.keymap.registerLayer({
    enabled: () => captured.holds(),
    commands: [
      {
        name: "syncPreview.close",
        title: "Close the sync preview",
        category: "Sync preview",
        palette: false,
        run: () => {
          deps.setState((s) => ({ ...s, syncPreview: { ...s.syncPreview, open: false } }))
          deps.render()
        },
      },
      {
        name: "syncPreview.sync",
        title: "Sync",
        category: "Sync preview",
        palette: false,
        run: () => {
          if (!deps.getState().syncPreview.loading) deps.onExecuteSync()
        },
      },
    ],
    bindings: [
      ...anyModifiers("escape", "syncPreview.close"),
      ...anyModifiers("return", "syncPreview.sync"),
      // The parser calls the key "return", but the keymap matches an event
      // named "enter" as a different key, though both name Enter.
      ...anyModifiers("enter", "syncPreview.sync"),
    ],
  })
  return () => {
    captured()
    unregisterLayer()
  }
}
