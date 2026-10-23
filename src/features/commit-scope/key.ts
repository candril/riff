/**
 * How a commit scope is cached: the commits in it, in list order (spec 078).
 */
export function commitScopeKey(sha: string, scope?: readonly string[] | null): string {
  return scope && scope.length > 1 ? scope.join("+") : sha
}
