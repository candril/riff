import type { DiffLineMapping } from "../vim-diff/line-mapping"
import { computeWordDiff, type WordSpan } from "../vim-diff/word-diff"

// A mapping is rebuilt on every fold and expansion, never mutated, so it is its own cache key.
const wordDiffs = new WeakMap<DiffLineMapping, Map<number, WordSpan[]>>()

export function wordsOf(mapping: DiffLineMapping): Map<number, WordSpan[]> {
  const known = wordDiffs.get(mapping)
  if (known) return known
  const words = computeWordDiff(mapping)
  wordDiffs.set(mapping, words)
  return words
}
