export type GitBase = { rev: string } | { mergeBaseOf: [string, string] }

export interface GitSides {
  head: string
  base: GitBase
}

/**
 * The two revisions a git review's diff runs between, by git's own reading of the target: the
 * versions of a file whose line numbers the diff's hunks count in. An empty end of a range is HEAD.
 */
export function gitSidesOf(target: string): GitSides {
  if (target.startsWith("branch:")) {
    return { head: "HEAD", base: { mergeBaseOf: [target.slice("branch:".length), "HEAD"] } }
  }
  const threeDot = target.indexOf("...")
  if (threeDot !== -1) {
    const head = target.slice(threeDot + 3) || "HEAD"
    return { head, base: { mergeBaseOf: [target.slice(0, threeDot) || "HEAD", head] } }
  }
  const twoDot = target.indexOf("..")
  if (twoDot !== -1) {
    return { head: target.slice(twoDot + 2) || "HEAD", base: { rev: target.slice(0, twoDot) || "HEAD" } }
  }
  return { head: target, base: { rev: `${target}^` } }
}
