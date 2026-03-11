/**
 * Configuration schema
 *
 * Defines the shape of the riff configuration file (~/.config/riff/config.toml).
 */

/**
 * Ignore configuration - patterns for hiding files from review
 */
export interface IgnoreConfig {
  patterns: string[]
}

/**
 * Storage configuration - where to store comments and session data
 */
export interface StorageConfig {
  /** Override default storage location */
  path?: string
  /** Base path to search for repos by name (e.g., "~/code") */
  basePath?: string
  /** Map GitHub remotes to local paths: "owner/repo" -> "~/path/to/repo" */
  repos: Record<string, string>
}

/**
 * Root configuration
 */
export interface Config {
  ignore: IgnoreConfig
  storage: StorageConfig
}
