/**
 * Shared types for feature modules.
 *
 * Each feature receives a FeatureContext that provides read access to state
 * and methods to update state. This keeps features decoupled from the app
 * orchestrator while giving them the access they need.
 */

import type { AppState } from "../state"
import type { VimCursorState } from "../vim-diff/types"
import type { DiffLineMapping } from "../vim-diff/line-mapping"
import type { CliRenderer } from "@opentui/core"

export interface FeatureContext {
  // Current state (read-only snapshot, use setState to update)
  readonly state: AppState
  readonly vimState: VimCursorState
  readonly lineMapping: DiffLineMapping

  // State updates
  setState: (updater: (s: AppState) => AppState) => void
  setVimState: (state: VimCursorState) => void
  rebuildLineMapping: () => void

  // Renderer access (for suspend/resume, scroll refs)
  renderer: CliRenderer

  // Source identifier for persistence
  source: string

  // Render trigger
  render: () => void
}
