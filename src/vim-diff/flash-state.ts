/**
 * FlashState - State for flash.nvim-style jump navigation (spec 022)
 *
 * Mirrors `require("flash").jump()` with flash.nvim's defaults: the search
 * is bidirectional over what's currently on screen, every match gets a
 * single home-row label, and nothing moves until a label is pressed.
 */

/** flash.nvim's default alphabet — home row first, then the easy reaches. */
export const FLASH_LABELS = "asdfghjklqwertyuiopzxcvbnm"

/**
 * A labelled jump target.
 */
export interface FlashMatch {
  /** 0-indexed visual line (index into the DiffLineMapping) */
  line: number
  /** Start column in the line (0-indexed) */
  startCol: number
  /** End column (exclusive) */
  endCol: number
  /** Key that jumps here, or null when the alphabet ran out */
  label: string | null
}

/**
 * Which surface flash is labelling (spec 066). The diff narrows first and
 * labels what is left, because labelling sixty rows of code is noise; a list
 * labels every visible row at once, because there are rarely forty of them
 * and it costs one keypress.
 */
export type FlashSurface = "diff" | "tree" | "state" | "feed" | "comments"

/** A labelled row of a list surface. The id is that surface's own. */
export interface FlashRow {
  id: string
  label: string
}

/**
 * State for flash mode
 */
export interface FlashState {
  /** Whether flash mode is capturing input */
  active: boolean
  /** What is being labelled */
  surface: FlashSurface
  /** Characters typed so far (diff only — a list labels straight away) */
  pattern: string
  /** Labelled matches, in document order */
  matches: FlashMatch[]
  /** Labelled rows, in list mode */
  rows: FlashRow[]
}

/**
 * Create initial/reset flash state
 */
export function createFlashState(): FlashState {
  return { active: false, surface: "diff", pattern: "", matches: [], rows: [] }
}

/**
 * Label a list's visible rows, top to bottom. Keys the surface would act on
 * are left out of the alphabet, so a mistyped jump never resolves a thread
 * or marks a file viewed — it just cancels.
 */
export function labelRows(ids: string[], reserved = ""): FlashRow[] {
  const taken = new Set(reserved.toLowerCase().split(""))
  const alphabet = FLASH_LABELS.split("").filter((char) => !taken.has(char))
  return ids.flatMap((id, index) => {
    const label = alphabet[index]
    return label ? [{ id, label }] : []
  })
}

/** The row a keypress jumps to, if it is one of the labels. */
export function findLabelledRow(rows: FlashRow[], char: string): FlashRow | null {
  const key = char.toLowerCase()
  return rows.find((row) => row.label === key) ?? null
}

export interface AssignLabelsOptions {
  /** Raw matches, in document order */
  matches: Array<{ line: number; startCol: number; endCol: number }>
  /** Cursor position — the closest matches get the earliest labels */
  cursor: { line: number; col: number }
  /** Content of a visual line, for the character that follows a match */
  getLineContent: (line: number) => string
  /** Label alphabet, in priority order */
  labels?: string
}

/**
 * Label matches, closest to the cursor first.
 *
 * A key that could also *continue* the search is ambiguous — pressing it
 * would have to mean both "jump there" and "narrow the pattern". flash.nvim
 * resolves this by dropping every such key from the alphabet, so typing
 * always extends the pattern and a label always jumps.
 */
export function assignLabels(options: AssignLabelsOptions): FlashMatch[] {
  const { matches, cursor, getLineContent } = options
  const alphabet = (options.labels ?? FLASH_LABELS).split("")

  const continuations = new Set<string>()
  for (const match of matches) {
    const next = getLineContent(match.line)[match.endCol]
    if (next) continuations.add(next.toLowerCase())
  }
  const available = alphabet.filter((char) => !continuations.has(char))

  const ranked = matches
    .map((match, index) => ({ match, index }))
    .sort((a, b) => {
      const lineDelta =
        Math.abs(a.match.line - cursor.line) - Math.abs(b.match.line - cursor.line)
      if (lineDelta !== 0) return lineDelta
      const colDelta =
        Math.abs(a.match.startCol - cursor.col) - Math.abs(b.match.startCol - cursor.col)
      if (colDelta !== 0) return colDelta
      return a.index - b.index
    })

  const labelByIndex = new Map<number, string>()
  ranked.forEach(({ index }, rank) => {
    const label = available[rank]
    if (label) labelByIndex.set(index, label)
  })

  return matches.map((match, index) => ({
    ...match,
    label: labelByIndex.get(index) ?? null,
  }))
}

/**
 * Find the match a keypress jumps to. Uppercase is accepted for lowercase
 * labels, matching flash.nvim's `label.uppercase`.
 */
export function findLabelledMatch(
  matches: FlashMatch[],
  char: string
): FlashMatch | null {
  const key = char.toLowerCase()
  return matches.find((match) => match.label === key) ?? null
}
