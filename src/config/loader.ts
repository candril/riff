/**
 * Config loader
 *
 * Loads configuration from ~/.config/riff/config.toml and merges
 * with defaults. Uses Bun's built-in TOML parser.
 */

import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { homedir } from "os"
import type { Config } from "./schema"
import { defaultConfig } from "./defaults"

/**
 * Get the config file path
 */
function getConfigPath(): string {
  return join(homedir(), ".config", "riff", "config.toml")
}

/**
 * Load and merge configuration from disk
 */
export function loadConfig(): Config {
  const configPath = getConfigPath()

  if (!existsSync(configPath)) {
    return defaultConfig
  }

  try {
    const raw = readFileSync(configPath, "utf-8")
    const parsed = Bun.TOML.parse(raw) as Record<string, unknown>

    return mergeConfig(parsed)
  } catch {
    // If config file is malformed, use defaults
    return defaultConfig
  }
}

/**
 * Merge parsed TOML with defaults
 */
function mergeConfig(parsed: Record<string, unknown>): Config {
  const config: Config = {
    ignore: { ...defaultConfig.ignore },
    storage: { ...defaultConfig.storage },
  }

  // Merge ignore section
  if (parsed.ignore && typeof parsed.ignore === "object") {
    const ignore = parsed.ignore as Record<string, unknown>
    if (Array.isArray(ignore.patterns)) {
      // User patterns replace defaults entirely (not merge)
      config.ignore = {
        patterns: ignore.patterns.filter((p): p is string => typeof p === "string"),
      }
    }
  }

  // Merge storage section
  if (parsed.storage && typeof parsed.storage === "object") {
    const storage = parsed.storage as Record<string, unknown>

    if (typeof storage.path === "string") {
      config.storage.path = storage.path
    }

    if (typeof storage.basePath === "string") {
      config.storage.basePath = storage.basePath
    }

    // Handle repos mapping (TOML nested table)
    if (storage.repos && typeof storage.repos === "object") {
      const repos = storage.repos as Record<string, unknown>
      config.storage.repos = {}
      for (const [key, value] of Object.entries(repos)) {
        if (typeof value === "string") {
          config.storage.repos[key] = value
        }
      }
    }
  }

  return config
}
