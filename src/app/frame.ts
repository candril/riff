import { createSignal, type Accessor } from "solid-js"
import type { AppState } from "../state"
import type { VimCursorState } from "../vim-diff/types"
import type { DiffLineMapping } from "../vim-diff/line-mapping"
import type { SearchState } from "../vim-diff/search-state"
import type { FlashState } from "../vim-diff/flash-state"

/**
 * What one render pass reads, published as a whole so views can derive
 * their own models from it. It bridges riff's plain-value state to Solid
 * until that state has accessors of its own (spec 100, M6).
 */
export interface Frame {
  state: AppState
  vimState: VimCursorState
  mapping: DiffLineMapping
  searchState: SearchState
  flashState: FlashState
  cachedCurrentUser: string | null
  width: number
  height: number
  /** The pass's clock, so every age drawn in one pass is measured from the same instant. */
  now: number
}

export function createFrame(): { frame: Accessor<Frame | null>; publish(next: Frame): void } {
  // Never equal: a pass republishes even when nothing it holds is new, as each
  // pass pushed every model before.
  const [frame, setFrame] = createSignal<Frame | null>(null, { equals: false })
  return { frame, publish: (next) => void setFrame(() => next) }
}
