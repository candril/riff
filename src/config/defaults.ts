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
  storage: {
    repos: {},
  },
}
