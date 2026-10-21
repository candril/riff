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

// The last frame each followed accessor's followers finished drawing.
const drawn = new WeakMap<Accessor<Frame | null>, Frame | null>()

/** Called by a follower once every island has drawn `current`. */
export function markDrawn(frame: Accessor<Frame | null>, current: Frame | null): void {
  drawn.set(frame, current)
}

/** Called once nothing follows `frame` any more, so publishing to it is never checked. */
export function unmarkDrawn(frame: Accessor<Frame | null>): void {
  drawn.delete(frame)
}

export function createFrame(): { frame: Accessor<Frame | null>; publish(next: Frame): void } {
  // Never equal: a pass republishes even when nothing it holds is new, as each
  // pass pushed every model before.
  const [frame, setFrame] = createSignal<Frame | null>(null, { equals: false })
  return {
    frame,
    publish(next) {
      setFrame(() => next)
      // render.ts focuses its inputs around publish and expects the islands to
      // have drawn by the time it returns, which a batch or an effect would
      // defer. Checked in tests only, where it costs nothing to be loud.
      if (process.env.NODE_ENV === "test" && drawn.has(frame) && drawn.get(frame) !== next) {
        throw new Error("render() ran inside a Solid batch or update, so the frame islands would draw after it returns")
      }
    },
  }
}
