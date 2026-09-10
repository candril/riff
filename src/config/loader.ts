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
    diff: { ...defaultConfig.diff },
    storage: { ...defaultConfig.storage },
    mentions: { ...defaultConfig.mentions },
    poll: { ...defaultConfig.poll },
    previews: { ...defaultConfig.previews, hosts: [...defaultConfig.previews.hosts] },
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

  // Merge diff section
  if (parsed.diff && typeof parsed.diff === "object") {
    const diff = parsed.diff as Record<string, unknown>
    if (typeof diff.wrap === "boolean") {
      config.diff.wrap = diff.wrap
    }
    if (typeof diff.alignMarkdownTables === "boolean") {
      config.diff.alignMarkdownTables = diff.alignMarkdownTables
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

  // Merge mentions section
  if (parsed.mentions && typeof parsed.mentions === "object") {
    const mentions = parsed.mentions as Record<string, unknown>
    if (Array.isArray(mentions.extra)) {
      config.mentions = {
        extra: mentions.extra.filter((h): h is string => typeof h === "string"),
      }
    }
  }

  // Merge previews section (spec 068). The TOML keys are snake_case, which
  // is what the spec documents and what the rest of the file looks like.
  if (parsed.previews && typeof parsed.previews === "object") {
    const previews = parsed.previews as Record<string, unknown>
    if (typeof previews.table_column === "string") {
      config.previews.tableColumn = previews.table_column
    }
    if (typeof previews.match_pr_number === "boolean") {
      config.previews.matchPrNumber = previews.match_pr_number
    }
    if (Array.isArray(previews.hosts)) {
      config.previews.hosts = previews.hosts.filter((h): h is string => typeof h === "string")
    }
    if (typeof previews.comment_marker === "string") {
      config.previews.commentMarker = previews.comment_marker
    }
    if (typeof previews.hide_source === "boolean") {
      config.previews.hideSource = previews.hide_source
    }
  }

  // Merge poll section
  if (parsed.poll && typeof parsed.poll === "object") {
    const poll = parsed.poll as Record<string, unknown>
    // Negative intervals would mean "poll constantly" once fed to a timer;
    // clamp to 0, which is the documented way to turn polling off.
    if (typeof poll.interval === "number" && Number.isFinite(poll.interval)) {
      config.poll.interval = Math.max(0, Math.floor(poll.interval))
    }
    if (typeof poll.onFocus === "boolean") {
      config.poll.onFocus = poll.onFocus
    }
  }

  return config
}
