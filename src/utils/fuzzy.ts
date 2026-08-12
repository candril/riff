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
 * Later fields are weaker signals than earlier ones — callers pass their
 * primary text first. Without this, an action whose *description* happens
 * to start with the query outranks one whose *label* contains it.
 */
function fieldWeight(index: number): number {
  return index === 0 ? 1 : index === 1 ? 0.7 : 0.5
}

/** Start of a word, or a camelCase hump. */
function isWordStart(text: string, index: number): boolean {
  if (index === 0) return true
  const prev = text[index - 1]!
  const cur = text[index]!
  if (!/[A-Za-z0-9]/.test(prev)) return true
  return prev === prev.toLowerCase() && cur !== cur.toLowerCase()
}

/**
 * Score a single whitespace-free term. Returns 0 when the term's
 * characters don't all appear in order.
 */
function scoreTerm(term: string, text: string): number {
  const lower = text.toLowerCase()

  if (lower === term) return SCORE_EXACT

  const idx = lower.indexOf(term)
  if (idx !== -1) {
    if (idx === 0) return SCORE_PREFIX
    return isWordStart(text, idx) ? SCORE_WORD_START : SCORE_SUBSTRING
  }

  let termIdx = 0
  let score = 0
  let firstMatch = -1
  let lastMatch = -1

  for (let i = 0; i < lower.length && termIdx < term.length; i++) {
    if (lower[i] !== term[termIdx]) continue

    if (firstMatch === -1) firstMatch = i
    if (lastMatch === i - 1) score += BONUS_CONSECUTIVE
    else if (isWordStart(text, i)) score += BONUS_WORD_START
    else score += BONUS_CHAR

    lastMatch = i
    termIdx++
  }

  if (termIdx !== term.length) return 0

  // A term whose characters land close together is a far better match than
  // one strung across the whole string.
  const density = term.length / (lastMatch - firstMatch + 1)
  return Math.min(SCORE_SUBSEQUENCE_MAX, score * density)
}

/**
 * Returns a score (higher = better match), or 0 if no match.
 *
 * Whitespace splits the query into terms that must all match but may match
 * in any order, so `editor open` finds "Open in Editor" just as `open ed`
 * does.
 */
export function fuzzyMatch(query: string, text: string): number {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return 1 // Empty query matches everything

  let total = 0
  for (const term of terms) {
    const score = scoreTerm(term, text)
    if (score === 0) return 0
    total += score
  }

  return total / terms.length
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

  const scored = items
    .map(item => {
      const texts = getText(item)
      const textsArray = Array.isArray(texts) ? texts : [texts]
      const score = Math.max(
        ...textsArray.map((t, i) => fuzzyMatch(query, t) * fieldWeight(i))
      )
      return { item, score }
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)

  return scored.map(({ item }) => item)
}
