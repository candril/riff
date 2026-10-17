import type { Mark, MarksState } from "./types"

export function isMarkLetter(ch: string): boolean {
  return /^[a-zA-Z]$/.test(ch)
}

export function setMark(state: MarksState, mark: Mark): MarksState {
  return { ...state, marks: [...state.marks.filter((m) => m.letter !== mark.letter), mark] }
}

export function deleteMark(state: MarksState, letter: string): MarksState {
  return {
    marks: state.marks.filter((m) => m.letter !== letter),
    current: state.current === letter ? null : state.current,
    previous: state.previous === letter ? null : state.previous,
  }
}

export function visitMark(state: MarksState, letter: string): MarksState {
  if (state.current === letter) return state
  return { ...state, previous: state.current, current: letter }
}

/** Where `''` goes: the mark visited before the current one, while it still exists. */
export function flipTarget(state: MarksState): string | null {
  const previous = state.previous
  if (previous === null) return null
  return state.marks.some((m) => m.letter === previous) ? previous : null
}

// Lowercase before uppercase, which ASCII has the other way round.
function rank(letter: string): number {
  const code = letter.charCodeAt(0)
  return letter >= "a" && letter <= "z" ? code - 97 : code - 65 + 26
}

export function marksInOrder(state: Pick<MarksState, "marks">): Mark[] {
  return [...state.marks].sort((a, b) => rank(a.letter) - rank(b.letter))
}

/** `]m` and `[m`: the neighbour of the current mark in letter order, wrapping. */
export function stepMark(state: MarksState, direction: 1 | -1): string | null {
  const ordered = marksInOrder(state)
  if (ordered.length === 0) return null

  const index = ordered.findIndex((m) => m.letter === state.current)
  if (index === -1) return (direction === 1 ? ordered[0] : ordered[ordered.length - 1])!.letter

  return ordered[(index + direction + ordered.length) % ordered.length]!.letter
}
