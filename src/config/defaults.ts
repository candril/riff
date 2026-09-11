/**
 * Default configuration values
 *
 * Sensible defaults that cover common cases. Users can override
 * these in ~/.config/riff/config.toml.
 */

import type { Config } from "./schema"

/**
 * Default ignore patterns - common generated/noisy files
 */
export const defaultIgnorePatterns: string[] = [
  // Lock files (most common)
  "package-lock.json",
  "bun.lockb",
  "yarn.lock",
  "pnpm-lock.yaml",
  "operations.lock.js",

  // Generated code markers
  "**/__generated__/**",
  "**/*.generated.*",

  // Snapshots
  "**/__snapshots__/**",
]

/**
 * Default configuration
 */
export const defaultConfig: Config = {
  ignore: {
    patterns: defaultIgnorePatterns,
  },
  diff: {
    wrap: false,
    alignMarkdownTables: true,
  },
  storage: {
    repos: {},
  },
  mentions: {
    extra: [],
  },
  editor: {
    // nvim's own diff mode. Anything that takes two paths works — an editor
    // that does not is why this is configuration and not a constant.
    diff: "nvim -d {old} {new}",
  },
  previews: {
    // The two defaults between them cover most deploy bots: a table with a
    // Preview column, or any link whose host or path carries the PR number.
    tableColumn: "Preview",
    matchPrNumber: true,
    hosts: [],
    hideSource: true,
  },
  poll: {
    // Comment activity moves on the order of minutes, and every tick costs
    // GraphQL quota. 5 minutes plus refresh-on-focus keeps replies current
    // without spending the budget on an idle pane.
    interval: 300,
    onFocus: true,
  },
}
