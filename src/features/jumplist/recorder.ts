import { isFindMotion, isListWalk, isStepMotion } from "./keys"
import { sameLocation } from "./place"
import type { Jump } from "./types"

type Key = { name?: string; ctrl?: boolean; shift?: boolean; sequence?: string }

/**
 * Where the reader is between two keys. `file` is the file under the cursor,
 * which in the all-files view is not the selected one. `settled` is false
 * while an interaction is still taking keys: a prompt, a picker, flash, a
 * chord or a find waiting for its character.
 */
export interface Moment {
  place: Jump
  file: string | null
  settled: boolean
}

type Kind = "jump" | "step" | "walk"

export interface JumpRecorder {
  /** Runs one key, and returns the place to push once the interaction it belongs to is over. */
  around(key: Key, before: Moment, dispatch: () => void, after: () => Moment): Jump | null
}

function kindOf(key: Key): Kind {
  if (isListWalk(key)) return "walk"
  if (isStepMotion(key) || isFindMotion(key)) return "step"
  return "jump"
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
        kind = kindOf(key)
      }
      dispatch()
      const now = after()
      if (!now.settled) return null

      const from = origin
      origin = null
      if (kind === "walk") return null
      if (kind === "step") return now.file !== null && now.file !== from.file ? from.place : null
      return sameLocation(from.place, now.place) ? null : from.place
    },
  }
}
