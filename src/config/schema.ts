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
 * Mention configuration - extra @mention candidates
 */
export interface MentionsConfig {
  /**
   * Handles to offer in the @mention picker on top of the ones riff can
   * discover itself. Teams (`org/team`) live here because the GitHub API
   * riff queries only returns users.
   */
  extra: string[]
}

/**
 * Root configuration
 */
export interface Config {
  ignore: IgnoreConfig
  storage: StorageConfig
  mentions: MentionsConfig
}
