/**
 * Resolved PR and issue references (spec 059)
 *
 * `#412` and a pasted GitHub URL become the title and state of what they
 * point at, in the comments panel and the PR overview.
 */

export { startReferencePrefetch, type ReferencePrefetchContext } from "./prefetch"
export { resolvedReferences, referenceRepo } from "./store"
