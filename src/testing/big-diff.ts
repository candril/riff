import { diffFile } from "../diff-rows/fixtures"
import { DiffLineMapping } from "../vim-diff/line-mapping"

/** Where a median keystroke on the big diff must land; CI machines are slower and shared. */
export const BOUND_MS = process.env["CI"] ? 48 : 16

// Removals pair with a run of additions as long or longer, so word diff has work and some halves are empty.
function file(i: number) {
  const context = (n: number) => `  const value${n} = compute(input${n}, { scale: ${n}, label: "item-${i}-${n}" })`
  const removed = Array.from({ length: 6 }, (_, n) => `-  total += legacyPrice(items[${n}], rate${i}) * ${n + 1}`)
  const added = Array.from({ length: 6 + (i % 3) }, (_, n) => `+  total += priceOf(items[${n}], rates.get("r${i}")) * ${n + 1}`)
  const before = [0, 1, 2, 3].map((n) => ` ${context(n)}`)
  const after = [4, 5, 6, 7].map((n) => ` ${context(n)}`)
  const header = `@@ -1,${8 + removed.length} +1,${8 + added.length} @@ function file${i}()`
  return diffFile(`src/dir${i % 20}/file${i}.ts`, [header, ...before, ...removed, ...added, ...after])
}

/** 500 files, over 10,000 mapping lines: the review both diff views are timed on. */
export const BIG_FILES = Array.from({ length: 500 }, (_, i) => file(i))
export const BIG_MAPPING = new DiffLineMapping(BIG_FILES, "all")

/** The median of 200 presses, each timed until `settle` has drawn its frame. */
export async function medianMove(press: () => void, settle: () => Promise<void>): Promise<number> {
  const timings: number[] = []
  for (let i = 0; i < 200; i++) {
    const start = performance.now()
    press()
    await settle()
    timings.push(performance.now() - start)
  }
  timings.sort((a, b) => a - b)
  return timings[100]!
}
