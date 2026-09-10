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
  /**
   * Pad markdown table cells onto a shared grid so the columns line up and
   * a changed cell is visible against the row it replaced. Display only —
   * the file is untouched, and `y` still yanks its text.
   */
  alignMarkdownTables: boolean
}

/**
 * Preview link detection (spec 068). Deploy bots differ in how they post
 * where they put a PR, so what counts as a preview is configured rather
 * than compiled in — with defaults that cover most of them.
 */
export interface PreviewsConfig {
  /** The table column the preview links live in. */
  tableColumn: string
  /** Treat a link carrying this PR's number as a preview of it. */
  matchPrNumber: boolean
  /** Hosts whose links are previews whatever they carry. `*` wildcards. */
  hosts: string[]
  /** An HTML comment id that marks the bot's comment, for the ones the
   *  two rules above miss. */
  commentMarker?: string
  /** Fold the source comment away in Conversation once it is lifted. */
  hideSource: boolean
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
  previews: PreviewsConfig
}
