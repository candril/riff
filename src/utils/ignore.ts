/**
 * Ignore pattern matcher
 *
 * Uses Bun.Glob to match filenames against configurable glob patterns.
 * Used to hide generated/noisy files from code review.
 */

/**
 * Matcher that checks filenames against a list of glob patterns.
 * Pre-compiles patterns for efficient repeated matching.
 */
export class IgnoreMatcher {
  private globs: Bun.Glob[]

  constructor(patterns: string[]) {
    this.globs = patterns.map((p) => new Bun.Glob(p))
  }

  /**
   * Check if a filename matches any ignore pattern
   */
  isIgnored(filename: string): boolean {
    return this.globs.some((glob) => glob.match(filename))
  }

  /**
   * Compute the set of ignored filenames from a list of files
   */
  computeIgnoredSet(files: { filename: string }[]): Set<string> {
    const ignored = new Set<string>()
    for (const file of files) {
      if (this.isIgnored(file.filename)) {
        ignored.add(file.filename)
      }
    }
    return ignored
  }

  /**
   * Whether this matcher has any patterns
   */
  get hasPatterns(): boolean {
    return this.globs.length > 0
  }
}
