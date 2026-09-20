import { $ } from "bun"
import { mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

/**
 * The repository `riff --demo` reviews: a small fictional shop checkout, committed
 * once and then edited, so the ordinary local path finds a working-copy diff with
 * a modification, an addition and a deletion in it.
 *
 * It is rebuilt on every launch. Drafts written during a demo live in the fixture's
 * own `.riff/` and must not colour the next run.
 */

const FIXTURE_DIR = join(tmpdir(), "riff-demo")

/** The committed state — what the review shows as the left-hand side. */
const BASE: Record<string, string> = {
  "README.md": `# shop

A checkout nobody has to think about.

## Running

    bun run src/checkout.ts
`,
  "src/cart.ts": `import type { Item } from "./types"

export function subtotal(items: Item[]): number {
  let total = 0
  for (const item of items) {
    total += item.price * item.quantity
  }
  return total
}

export function itemCount(items: Item[]): number {
  return items.reduce((n, item) => n + item.quantity, 0)
}
`,
  "src/checkout.ts": `import { subtotal } from "./cart"
import { shippingFor } from "./legacy-pricing"
import type { Item } from "./types"

export function checkout(items: Item[], country: string) {
  const goods = subtotal(items)
  const shipping = shippingFor(country, goods)

  return {
    goods,
    shipping,
    total: goods + shipping,
  }
}
`,
  "src/legacy-pricing.ts": `/** The shipping table we inherited. Nobody remembers where the numbers came from. */
export function shippingFor(country: string, goods: number): number {
  if (country === "CH") return goods > 100 ? 0 : 7
  if (country === "DE") return goods > 150 ? 0 : 9
  return 19
}
`,
  "src/types.ts": `export interface Item {
  sku: string
  price: number
  quantity: number
}
`,
}

/** The edits left uncommitted on top, which is what the review is of. */
const EDITS: Record<string, string> = {
  "README.md": `# shop

A checkout nobody has to think about.

## Running

    bun run src/checkout.ts

## Shipping

Rates live in \`src/discount.ts\` now, with the thresholds written down
rather than remembered.
`,
  "src/cart.ts": `import type { Item } from "./types"

export function subtotal(items: Item[]): number {
  return items.reduce((total, item) => total + item.price * item.quantity, 0)
}

export function itemCount(items: Item[]): number {
  return items.reduce((n, item) => n + item.quantity, 0)
}

/** Free shipping is decided on goods, never on the shipping-inclusive total. */
export function qualifiesForFreeShipping(items: Item[], threshold: number): boolean {
  return subtotal(items) >= threshold
}
`,
  "src/checkout.ts": `import { qualifiesForFreeShipping, subtotal } from "./cart"
import { shippingFor, thresholdFor } from "./discount"
import type { Item } from "./types"

export function checkout(items: Item[], country: string) {
  const goods = subtotal(items)
  const free = qualifiesForFreeShipping(items, thresholdFor(country))
  const shipping = free ? 0 : shippingFor(country)

  return {
    goods,
    shipping,
    free,
    total: goods + shipping,
  }
}
`,
  "src/discount.ts": `/** Shipping, with the thresholds stated instead of buried in a chain of ifs. */
const RATES: Record<string, { flat: number; freeOver: number }> = {
  CH: { flat: 7, freeOver: 100 },
  DE: { flat: 9, freeOver: 150 },
}

const REST_OF_WORLD = { flat: 19, freeOver: Infinity }

export function shippingFor(country: string): number {
  return (RATES[country] ?? REST_OF_WORLD).flat
}

export function thresholdFor(country: string): number {
  return (RATES[country] ?? REST_OF_WORLD).freeOver
}
`,
}

/** Tracked in the base commit, gone in the review. */
const DELETED = "src/legacy-pricing.ts"

async function write(dir: string, files: Record<string, string>): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    const full = join(dir, path)
    await mkdir(dirname(full), { recursive: true })
    await writeFile(full, content)
  }
}

/**
 * Build the fixture and return its path. The git identity is passed per command:
 * the demo must not depend on — or write to — whatever the user has configured.
 */
export async function createDemoRepo(): Promise<string> {
  const dir = FIXTURE_DIR
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })

  const git = (...args: string[]) =>
    $`git -C ${dir} -c user.name=riff -c user.email=riff@example.com -c commit.gpgsign=false ${args}`
      .quiet()
      .nothrow()

  await git("init", "-q", "-b", "main")
  await write(dir, BASE)
  await git("add", "-A")
  await git("commit", "-q", "-m", "shop: checkout over the inherited shipping table")

  await write(dir, EDITS)
  await rm(join(dir, DELETED), { force: true })
  // `git diff` ignores untracked files, so the new file is staged as an intent to
  // add — otherwise the review would show the deletion but not what replaced it.
  await git("add", "-N", "src/discount.ts")

  return dir
}
