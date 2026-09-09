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
 * Background comment poll configuration
 */
export interface PollConfig {
  /**
   * Seconds between background checks for new/updated review comments.
   * 0 disables polling entirely (`gr` still refreshes on demand).
   */
  interval: number
  /**
   * Skip ticks while the terminal is unfocused, and refresh on focus-in
   * instead. Needs a terminal that supports focus reporting; harmless
   * elsewhere, since riff then just never hears about a focus change.
   */
  onFocus: boolean
}

/**
 * Diff rendering configuration
 */
export interface DiffConfig {
  /**
   * Soft-wrap long lines instead of scrolling sideways. Off by default:
   * wrapping costs the row-per-line alignment that makes the diff read
   * like a diff.
   */
  wrap: boolean
}

/**
 * Root configuration
 */
export interface Config {
  ignore: IgnoreConfig
  diff: DiffConfig
  storage: StorageConfig
  mentions: MentionsConfig
  poll: PollConfig
}
