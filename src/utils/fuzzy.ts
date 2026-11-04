/**
 * Fuzzy matching for the action menu and the pickers.
 *
 * Ranking is stateless and match-quality driven: a match class (exact,
 * prefix, word start, substring, scattered subsequence) dominates, and
 * ties fall through to the caller's list order — which for the action
 * registry and the file list is already a curated order, and is a better
 * tiebreak than any heuristic. Notably there is no "shorter text wins"
 * term: it made `open` rank "Open Fold" above "Open in Editor" purely on
 * label length.
 */

const SCORE_EXACT = 1000
const SCORE_PREFIX = 800
const SCORE_WORD_START = 700
const SCORE_SUBSTRING = 600

/** Ceiling for scattered matches, so any substring hit outranks them. */
const SCORE_SUBSEQUENCE_MAX = 500

const BONUS_CONSECUTIVE = 12
const BONUS_WORD_START = 10
const BONUS_CHAR = 2

/**
 * What the characters skipped between two matched ones cost: the first one
 * a little more than the rest, so one gap costs more than a longer one
 * would per character. Small beside BONUS_WORD_START, so `fm` takes the M
 * of "Model" in FamilyReadModel over the m right after the F.
 */
const PENALTY_GAP_START = 2
const PENALTY_GAP_EXTEND = 0.5

/**
 * Later fields are weaker signals than earlier ones — callers pass their
 * primary text first. Without this, an action whose *description* happens
 * to start with the query outranks one whose *label* contains it.
 */
function fieldWeight(index: number): number {
  return index === 0 ? 1 : index === 1 ? 0.7 : 0.5
}

/** Start of the text or of a word (after anything not a letter or digit), or a camelCase hump. */
function isWordStart(text: string, index: number): boolean {
  if (index === 0) return true
  const prev = text[index - 1]!
  const cur = text[index]!
  if (!/[A-Za-z0-9]/.test(prev)) return true
  return prev === prev.toLowerCase() && cur !== cur.toLowerCase()
}

interface TermMatch {
  score: number
  /** Indices into the text, ascending: the characters the score was earned on. */
  positions: number[]
}

/**
 * The text lowercased one code unit for one, so an index into it is an
 * index into the text. `toLowerCase` on the whole string can grow it: "İ"
 * becomes "i" and a combining dot, and every position after it would point
 * one character too far. Such a character folds to its first unit instead.
 */
function foldCase(text: string): string {
  const lower = text.toLowerCase()
  // Lowercasing never shortens a string, so an unchanged length means nothing grew.
  if (lower.length === text.length) return lower
  let folded = ""
  for (let i = 0; i < text.length; i++) folded += text[i]!.toLowerCase()[0]!
  return folded
}

const range = (start: number, length: number) => Array.from({ length }, (_, i) => start + i)

/** The first occurrence of `term` at a word start, else the first occurrence at all; -1 for none. */
function bestOccurrence(lower: string, text: string, term: string): number {
  const first = lower.indexOf(term)
  for (let at = first; at !== -1; at = lower.indexOf(term, at + 1)) {
    if (isWordStart(text, at)) return at
  }
  return first
}

/**
 * Score a single whitespace-free term, or null when the term's characters
 * don't all appear in order.
 */
function scoreTerm(term: string, text: string): TermMatch | null {
  const lower = foldCase(text)

  if (lower === term) return { score: SCORE_EXACT, positions: range(0, term.length) }

  const idx = bestOccurrence(lower, text, term)
  if (idx !== -1) {
    const score = idx === 0 ? SCORE_PREFIX : isWordStart(text, idx) ? SCORE_WORD_START : SCORE_SUBSTRING
    return { score, positions: range(idx, term.length) }
  }

  return alignScattered(term, text, lower)
}

/**
 * The best-scoring way to match the term's characters in order, by dynamic
 * programming over (term character, text position), as fzf does. A matched
 * character earns BONUS_CONSECUTIVE right after the previous one, else
 * BONUS_WORD_START at a word start, else BONUS_CHAR; the characters skipped
 * between matches cost the gap penalties, those before the first match
 * nothing. A greedy scan takes the first occurrence of each character and
 * so misses the word starts further on.
 *
 * O(term × text) time and memory, bounded by a greedy check that rejects a
 * non-match in one pass first.
 */
function alignScattered(term: string, text: string, lower: string): TermMatch | null {
  const m = term.length
  const n = lower.length

  // The earliest and latest place each term character can match bound the DP's columns.
  const lo = new Int32Array(m)
  for (let j = 0, i = 0; j < m; j++, i++) {
    while (i < n && lower[i] !== term[j]) i++
    if (i === n) return null
    lo[j] = i
  }
  const hi = new Int32Array(m)
  for (let j = m - 1, i = n - 1; j >= 0; j--, i--) {
    while (lower[i] !== term[j]) i--
    hi[j] = i
  }

  const wordStart = new Uint8Array(n)
  for (let i = lo[0]!; i <= hi[m - 1]!; i++) wordStart[i] = isWordStart(text, i) ? 1 : 0

  // best[j * n + i]: the best score with term[j] matched at i; from[]: where term[j - 1] was.
  const best = new Float64Array(m * n).fill(-Infinity)
  const from = new Int32Array(m * n).fill(-1)

  for (let i = lo[0]!; i <= hi[0]!; i++) {
    if (lower[i] === term[0]) best[i] = wordStart[i] ? BONUS_WORD_START : BONUS_CHAR
  }

  for (let j = 1; j < m; j++) {
    const row = j * n
    const prev = row - n
    // The best previous match at least one character back, the gap to i already charged.
    let gapped = -Infinity
    let gappedAt = -1
    // From just past the previous character's earliest match, so every place it can sit is folded into `gapped`.
    for (let i = lo[j - 1]! + 1; i <= hi[j]!; i++) {
      if (i >= 2) {
        const opened = best[prev + i - 2]! - PENALTY_GAP_START
        const extended = gapped - PENALTY_GAP_EXTEND
        if (opened > extended) {
          gapped = opened
          gappedAt = i - 2
        } else {
          gapped = extended
        }
      }
      if (i < lo[j]! || lower[i] !== term[j]) continue

      const adjacent = best[prev + i - 1]! + BONUS_CONSECUTIVE
      const skipped = gapped + (wordStart[i] ? BONUS_WORD_START : BONUS_CHAR)
      if (adjacent >= skipped && adjacent > -Infinity) {
        best[row + i] = adjacent
        from[row + i] = i - 1
      } else if (skipped > -Infinity) {
        best[row + i] = skipped
        from[row + i] = gappedAt
      }
    }
  }

  const last = (m - 1) * n
  let end = -1
  for (let i = lo[m - 1]!; i <= hi[m - 1]!; i++) {
    if (end === -1 || best[last + i]! > best[last + end]!) end = i
  }

  const positions = new Array<number>(m)
  for (let j = m - 1, i = end; j >= 0; j--) {
    positions[j] = i
    i = from[j * n + i]!
  }

  // A match strung out with long gaps can score below nothing; it still matched.
  return { score: Math.max(1, Math.min(SCORE_SUBSEQUENCE_MAX, best[last + end]!)), positions }
}

export interface FuzzyMatch {
  score: number
  /** Indices into the text, ascending and unique: what to highlight. */
  positions: number[]
}

/**
 * The score (higher = better) and the matched characters, or null when the
 * text doesn't match.
 *
 * Whitespace splits the query into terms that must all match but may match
 * in any order, so `editor open` finds "Open in Editor" just as `open ed`
 * does. Each term's characters are highlighted; where two terms land on the
 * same character it is highlighted once.
 */
export function fuzzyMatchPositions(query: string, text: string): FuzzyMatch | null {
  const terms = foldCase(query).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return { score: 1, positions: [] } // Empty query matches everything

  let total = 0
  const positions = new Set<number>()
  for (const term of terms) {
    const match = scoreTerm(term, text)
    if (!match) return null
    total += match.score
    for (const p of match.positions) positions.add(p)
  }

  return { score: total / terms.length, positions: [...positions].sort((a, b) => a - b) }
}

/** Returns a score (higher = better match), or 0 if no match. */
export function fuzzyMatch(query: string, text: string): number {
  return fuzzyMatchPositions(query, text)?.score ?? 0
}

export interface FuzzyHit<T> {
  item: T
  /** Which of `getText`'s texts the item ranked on: the first of the best. */
  field: number
  /** Indices into that text. Empty for an empty query. */
  positions: number[]
}

/**
 * Filter and sort items by fuzzy match score, keeping which text each one
 * matched on and where, for the row to highlight.
 *
 * `getText` may return several texts for one item, most significant first;
 * later ones are matched at a discount. Equal scores keep input order.
 */
export function fuzzyFilterMatches<T>(
  query: string,
  items: readonly T[],
  getText: (item: T) => string | string[]
): FuzzyHit<T>[] {
  if (!query) return items.map((item) => ({ item, field: 0, positions: [] }))

  const scored: (FuzzyHit<T> & { score: number })[] = []
  for (const item of items) {
    const texts = getText(item)
    const textsArray = Array.isArray(texts) ? texts : [texts]
    let best: (FuzzyHit<T> & { score: number }) | null = null
    textsArray.forEach((text, field) => {
      const match = fuzzyMatchPositions(query, text)
      if (!match) return
      const score = match.score * fieldWeight(field)
      if (!best || score > best.score) best = { item, field, positions: match.positions, score }
    })
    if (best) scored.push(best)
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .map(({ item, field, positions }) => ({ item, field, positions }))
}

/**
 * Filter and sort items by fuzzy match score.
 *
 * `getText` may return several texts for one item, most significant first;
 * later ones are matched at a discount. Equal scores keep input order.
 */
export function fuzzyFilter<T>(
  query: string,
  items: T[],
  getText: (item: T) => string | string[]
): T[] {
  if (!query) return items
  return fuzzyFilterMatches(query, items, getText).map(({ item }) => item)
}
