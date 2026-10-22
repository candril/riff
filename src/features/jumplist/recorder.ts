import { isFindMotion, isListWalk, isStepMotion, isZOpener } from "./keys"
import { sameLocation } from "./place"
import type { Jump } from "./types"

type Key = { name?: string; ctrl?: boolean; shift?: boolean; sequence?: string }

/**
 * Where the reader is between two keys. `file` is the file under the cursor,
 * which in the all-files view is not the selected one. `settled` is false
 * while an interaction is still taking keys: a prompt, a picker, flash, a
 * chord or a find waiting for its character. `stepsMoveTheDiff` is true
 * while the thread panel holds the keys: its `j` and `k` take the diff's
 * cursor to another thread, which is a jump wherever it lands.
 */
export interface Moment {
  place: Jump
  file: string | null
  settled: boolean
  stepsMoveTheDiff: boolean
}

type Kind = "jump" | "step" | "walk" | "z"

export interface JumpRecorder {
  /** Runs one key, and returns the place to push once the interaction it belongs to is over. */
  around(key: Key, before: Moment, dispatch: () => void, after: () => Moment): Jump | null
}

function kindOf(key: Key, before: Moment): Kind {
  if (isListWalk(key)) return "walk"
  if (isZOpener(key)) return "z"
  if (isStepMotion(key) || isFindMotion(key)) return before.stepsMoveTheDiff ? "jump" : "step"
  return "jump"
}

/*
 * A divider or the spacing below a file anchors to the numbered row above
 * it, so by the anchor alone a jump onto one from that row would go
 * nowhere; the line tells them apart.
 */
function moved(from: Jump, to: Jump): boolean {
  return !sameLocation(from, to) || from.cursorLine !== to.cursorLine
}

/*
 * A fold, an unfold or the wrap toggle renumbers the mapping under an
 * anchor that stays put, so a `z` interaction is judged by the anchor
 * alone: the line would call every fold a jump, which nvim never does. A
 * `z` that breaks off into another key, as `zg` then `g` does into `gg`,
 * still lands on another row and records.
 */
function changedRow(from: Jump, to: Jump): boolean {
  return !sameLocation(from, to)
}

/*
 * A jump is one interaction, from the key that starts it to the moment
 * nothing is waiting for more keys — not one keypress. `/` moves the cursor
 * on every character typed, a picker takes `j` and `k` as letters, a flash
 * label can be `j`, and `]c` is two keys: judged key by key, each of these
 * would record a half-finished place or mistake itself for a step. The
 * key that opens an interaction decides what kind it is; the keys inside it
 * only carry it along.
 */
export function createJumpRecorder(): JumpRecorder {
  let origin: Moment | null = null
  let kind: Kind = "jump"

  return {
    around(key, before, dispatch, after) {
      if (before.settled || origin === null) {
        origin = before
        kind = kindOf(key, before)
      }
      dispatch()
      const now = after()
      if (!now.settled) return null

      const from = origin
      origin = null
      if (kind === "walk") return null
      if (kind === "step") return now.file !== null && now.file !== from.file ? from.place : null
      if (kind === "z") return changedRow(from.place, now.place) ? from.place : null
      return moved(from.place, now.place) ? from.place : null
    },
  }
}
