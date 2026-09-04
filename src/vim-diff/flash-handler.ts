/**
 * FlashHandler - Orchestrates flash jump mode (spec 022)
 *
 * Flash only ever searches what the user can see, which is what makes a
 * single-character label alphabet enough. The view supplies that region;
 * this handler owns the pattern, the labels, and the jump.
 */

import type { DiffLineMapping } from "./line-mapping"
import type { VimCursorState } from "./types"
import type { FlashMatch, FlashState } from "./flash-state"
import { assignLabels, createFlashState, findLabelledMatch } from "./flash-state"

/** The slice of the diff currently on screen. */
export interface FlashRegion {
  /** Visual line indices on screen, top to bottom */
  lines: number[]
  /** First visible column (0-indexed) */
  startCol: number
  /** Last visible column (exclusive) */
  endCol: number
}

/** Line types that hold code — flash never labels headers or fold markers. */
const JUMPABLE_TYPES = new Set(["context", "addition", "deletion"])

export interface FlashHandlerOptions {
  getMapping: () => DiffLineMapping
  getFlashState: () => FlashState
  setFlashState: (state: FlashState) => void
  getCursor: () => VimCursorState
  setCursor: (line: number, col: number) => void
  getVisibleRegion: () => FlashRegion | null
  /** Snapshot the pre-jump position so Ctrl-O comes back here (spec 038). */
  recordJump: () => void
  onUpdate: () => void
}

export class FlashHandler {
  constructor(private opts: FlashHandlerOptions) {}

  /**
   * Enter flash mode. Nothing is labelled until the first character is
   * typed — flash.nvim shows the backdrop straight away, matches follow.
   */
  start(): void {
    this.opts.setFlashState({ active: true, pattern: "", matches: [] })
    this.opts.onUpdate()
  }

  /**
   * Handle a printable key: a label jumps, anything else narrows the search.
   */
  handleChar(char: string): void {
    const state = this.opts.getFlashState()
    if (!state.active) return

    const labelled = findLabelledMatch(state.matches, char)
    if (labelled) {
      this.jump(labelled)
      return
    }

    this.updatePattern(state.pattern + char)
  }

  /**
   * Backspace un-types a character; on an empty pattern it leaves flash mode.
   */
  handleBackspace(): void {
    const state = this.opts.getFlashState()
    if (!state.active) return

    if (state.pattern.length === 0) {
      this.cancel()
      return
    }

    this.updatePattern(state.pattern.slice(0, -1))
  }

  /**
   * Leave flash mode without moving. The cursor never moved while typing,
   * so there is nothing to restore.
   */
  cancel(): void {
    if (!this.opts.getFlashState().active) return
    this.opts.setFlashState(createFlashState())
    this.opts.onUpdate()
  }

  private updatePattern(pattern: string): void {
    const mapping = this.opts.getMapping()
    const region = this.opts.getVisibleRegion()
    const cursor = this.opts.getCursor()

    const matches: Array<{ line: number; startCol: number; endCol: number }> = []

    if (pattern && region) {
      const needle = pattern.toLowerCase()
      for (const line of region.lines) {
        const type = mapping.getLine(line)?.type
        if (!type || !JUMPABLE_TYPES.has(type)) continue

        const haystack = mapping.getLineContent(line).toLowerCase()
        let from = region.startCol
        for (;;) {
          const at = haystack.indexOf(needle, from)
          if (at < 0 || at >= region.endCol) break
          matches.push({ line, startCol: at, endCol: at + needle.length })
          from = at + 1
        }
      }
    }

    this.opts.setFlashState({
      active: true,
      pattern,
      matches: assignLabels({
        matches,
        cursor,
        getLineContent: (line) => mapping.getLineContent(line),
      }),
    })

    this.opts.onUpdate()
  }

  private jump(match: FlashMatch): void {
    this.opts.recordJump()
    this.opts.setFlashState(createFlashState())
    this.opts.setCursor(match.line, match.startCol)
    this.opts.onUpdate()
  }
}
